import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { validarSaldoSuficiente } from '@/lib/bodega-kardex'

// Spec: HU-030 CA-01 — a diferencia de HU-028/029, asistente_compras no
// participa: un Egreso nunca está ligado a una OC que gestione, es una
// acción puramente operativa de Bodega.
const ROLES_EGRESO = ['bodega', 'compras', 'admin']

export type AuthEgreso =
  | { ok: true; userId: string; rol: string; nombre: string; email: string }
  | { ok: false; status: 401 | 403 }

export async function verificarAutorizacionEgreso(): Promise<AuthEgreso> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol, nombre, email')
    .eq('id', user.id)
    .single()

  if (!perfil || !ROLES_EGRESO.includes(perfil.rol)) return { ok: false, status: 403 }

  return { ok: true, userId: user.id, rol: perfil.rol, nombre: perfil.nombre, email: perfil.email }
}

type ActorEgreso = { id: string; nombre: string; email: string; rol: string }
type TipoEgreso = 'venta' | 'gasto' | 'prestamo' | 'reconteo'
type LineaEgreso = { producto_id: string; cantidad: number }

type ResultadoCreacion =
  | { ok: true; documentoId: string; numero: string }
  | { ok: false; error: string }

// Spec: HU-030 CA-01 — creación de Documento de Egreso. cliente_final_id/
// pozo_id solo tienen efecto en venta/gasto; en prestamo/reconteo se ignoran
// (no es un error, CA-01 dice que esos 2 tipos simplemente "no los usan").
export async function crearDocumentoEgreso(
  input: {
    tipo: TipoEgreso
    bodegaId: string
    clienteFinalId?: string | null
    pozoId?: string | null
    lineas: LineaEgreso[]
  },
  actor: ActorEgreso
): Promise<ResultadoCreacion> {
  if (!['venta', 'gasto', 'prestamo', 'reconteo'].includes(input.tipo)) {
    return { ok: false, error: "tipo debe ser 'venta', 'gasto', 'prestamo' o 'reconteo'" }
  }
  if (!input.bodegaId) return { ok: false, error: 'bodega_id es requerido' }
  if (input.lineas.length === 0) return { ok: false, error: 'El documento debe tener al menos 1 línea' }
  if (input.lineas.some((l) => !l.producto_id)) {
    return { ok: false, error: 'Toda línea requiere un producto vinculado' }
  }

  const permiteDestino = input.tipo === 'venta' || input.tipo === 'gasto'

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_egreso', { p_year: año })
  const numero = `EGR-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: documento, error: errDoc } = await adminClient()
    .from('documentos_egreso')
    .insert({
      numero,
      bodega_id: input.bodegaId,
      tipo: input.tipo,
      estado: 'generado',
      cliente_final_id: permiteDestino ? (input.clienteFinalId ?? null) : null,
      pozo_id: permiteDestino ? (input.pozoId ?? null) : null,
      creado_por_id: actor.id,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al crear Documento de Egreso:', errDoc)
    return { ok: false, error: 'Error al crear el documento' }
  }

  const { error: errLineas } = await adminClient().from('documentos_egreso_items').insert(
    input.lineas.map((l) => ({
      documento_egreso_id: documento.id,
      producto_id: l.producto_id,
      cantidad: Number(l.cantidad),
    }))
  )
  if (errLineas) {
    console.error('Error al insertar líneas del Documento de Egreso:', errLineas)
    return { ok: false, error: 'Error al guardar las líneas' }
  }

  await registrarAuditoria({
    accion: 'crear_documento_egreso',
    entidad: 'documento_egreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { tipo: input.tipo, lineas: input.lineas.length, actor_rol: actor.rol },
  })

  return { ok: true, documentoId: documento.id, numero: documento.numero }
}

type ResultadoCierreEgreso =
  | { ok: true }
  | { ok: false; error: string; lineasExcedidas?: string[] }

// Spec: HU-030 CA-02/CA-03/CA-06 — cierra el Egreso, genera Kardex de Salida
// sin recalcular el promedio ponderado (RN-BOD-07/082), solo decrementa
// saldo_existencias al costo vigente. Bloqueo duro por saldo insuficiente,
// salvo override explícito de admin con justificación.
export async function cerrarDocumentoEgreso(
  documentoId: string,
  actor: ActorEgreso,
  opciones?: { override?: boolean; justificacion?: string }
): Promise<ResultadoCierreEgreso> {
  const { data: documento } = await adminClient()
    .from('documentos_egreso')
    .select('id, numero, estado, tipo, bodega_id')
    .eq('id', documentoId)
    .single()

  if (!documento) return { ok: false, error: 'Documento de Egreso no encontrado' }
  if (documento.estado === 'cerrado') return { ok: false, error: 'El documento ya está cerrado' }

  const { data: lineas } = await adminClient()
    .from('documentos_egreso_items')
    .select('id, producto_id, cantidad')
    .eq('documento_egreso_id', documentoId)

  const todasLasLineas = lineas ?? []
  if (todasLasLineas.length === 0) return { ok: false, error: 'El documento no tiene líneas' }
  if (todasLasLineas.some((l) => Number(l.cantidad) <= 0)) {
    return { ok: false, error: 'Hay líneas con cantidad 0 o inválida' }
  }

  const permiteOverride = !!opciones?.override && actor.rol === 'admin' && !!opciones?.justificacion?.trim()

  // Spec: CA-03 — verifica saldo suficiente de TODAS las líneas antes de
  // insertar ningún Kardex (evita dejar el documento parcialmente cerrado
  // por una línea que sí tenía saldo seguida de otra que no).
  const productoIds = [...new Set(todasLasLineas.map((l) => l.producto_id))]
  const { data: productos } = await adminClient()
    .from('inventario')
    .select('id, codigo, saldo_existencias, costo_unitario')
    .in('id', productoIds)
  const productoPorId = new Map((productos ?? []).map((p) => [p.id, p]))

  if (!permiteOverride) {
    const lineasExcedidas = todasLasLineas
      .filter((l) => {
        const saldoActual = Number(productoPorId.get(l.producto_id)?.saldo_existencias ?? 0)
        return !validarSaldoSuficiente(saldoActual, Number(l.cantidad))
      })
      .map((l) => productoPorId.get(l.producto_id)?.codigo ?? l.producto_id)

    if (lineasExcedidas.length > 0) {
      return {
        ok: false,
        error: 'Saldo insuficiente en una o más líneas — requiere override de admin con justificación',
        lineasExcedidas,
      }
    }
  }

  const { data: kardexYaGenerado } = await adminClient()
    .from('kardex_movimientos')
    .select('producto_id')
    .eq('documento_egreso_id', documentoId)
  const productosYaProcesados = new Set((kardexYaGenerado ?? []).map((k) => k.producto_id))

  for (const linea of todasLasLineas) {
    if (productosYaProcesados.has(linea.producto_id)) continue

    const producto = productoPorId.get(linea.producto_id)
    const saldoActual = Number(producto?.saldo_existencias ?? 0)
    const costoActual = Number(producto?.costo_unitario ?? 0)
    const cantidad = Number(linea.cantidad)
    const nuevoSaldo = saldoActual - cantidad

    const { error: errKardex } = await adminClient().from('kardex_movimientos').insert({
      producto_id: linea.producto_id,
      bodega_id: documento.bodega_id,
      direccion: 'salida',
      tipo: documento.tipo,
      cantidad,
      costo_unitario: costoActual,
      saldo_resultante: nuevoSaldo,
      // Spec: RN-BOD-07/082 — la Salida nunca recalcula el promedio ponderado.
      costo_promedio_resultante: costoActual,
      documento_egreso_id: documentoId,
    })

    if (errKardex) {
      console.error('Error al generar movimiento de Kardex (egreso):', errKardex)
      return { ok: false, error: 'Error al generar el Kardex — el documento no se cerró, se puede reintentar' }
    }

    await adminClient().from('inventario').update({
      saldo_existencias: nuevoSaldo,
      // Spec: HU-034 CA-03 — un Reconteo actualiza la fecha de último conteo
      // físico; ningún otro tipo de movimiento la toca.
      ...(documento.tipo === 'reconteo'
        ? { ultimo_conteo_fecha: new Date().toISOString().slice(0, 10) }
        : {}),
    }).eq('id', linea.producto_id)
  }

  await adminClient()
    .from('documentos_egreso')
    .update({
      estado: 'cerrado',
      cerrado_por_id: actor.id,
      cerrado_en: new Date().toISOString(),
      override_admin: permiteOverride,
      justificacion_override: permiteOverride ? opciones!.justificacion!.trim() : null,
    })
    .eq('id', documentoId)

  await registrarAuditoria({
    accion: permiteOverride ? 'cerrar_documento_egreso_override' : 'cerrar_documento_egreso',
    entidad: 'documento_egreso',
    entidad_id: documentoId,
    referencia: documento.numero,
    detalle: { lineas: todasLasLineas.length, actor_rol: actor.rol, override: permiteOverride },
  })

  return { ok: true }
}

// Spec: HU-030 CA-05 — un Préstamo cerrado cuenta como pendiente mientras
// ningún Documento de Ingreso tipo Devolución CERRADO lo referencie.
export async function listarPrestamosPendientes(): Promise<
  { id: string; numero: string; bodega_id: string; cerrado_en: string | null }[]
> {
  const { data: prestamos } = await adminClient()
    .from('documentos_egreso')
    .select('id, numero, bodega_id, cerrado_en')
    .eq('tipo', 'prestamo')
    .eq('estado', 'cerrado')

  const { data: devueltos } = await adminClient()
    .from('documentos_ingreso')
    .select('egreso_prestamo_id')
    .eq('estado', 'cerrado')
    .not('egreso_prestamo_id', 'is', null)

  const idsDevueltos = new Set((devueltos ?? []).map((d) => d.egreso_prestamo_id))
  return (prestamos ?? []).filter((p) => !idsDevueltos.has(p.id))
}
