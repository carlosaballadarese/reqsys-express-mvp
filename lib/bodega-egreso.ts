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
type LineaEgreso = { producto_id: string; cantidad: number; requiere_guia?: boolean }

// Spec: HU-042 CA-02 — cada línea hereda el indicador del producto (inventario.requiere_guia)
// salvo que el cliente envíe un valor explícito (override por línea).
export async function resolverRequiereGuiaLineas(lineas: LineaEgreso[]): Promise<boolean[]> {
  const faltantes = [...new Set(lineas.filter((l) => typeof l.requiere_guia !== 'boolean' && l.producto_id).map((l) => l.producto_id))]
  const porProducto = new Map<string, boolean>()
  if (faltantes.length > 0) {
    const { data } = await adminClient().from('inventario').select('id, requiere_guia').in('id', faltantes)
    for (const p of data ?? []) porProducto.set(p.id, p.requiere_guia !== false)
  }
  return lineas.map((l) => (typeof l.requiere_guia === 'boolean' ? l.requiere_guia : (porProducto.get(l.producto_id) ?? true)))
}

type ResultadoCreacion =
  | { ok: true; documentoId: string; numero: string }
  | { ok: false; error: string }

// Spec: HU-030 CA-01 — creación de Documento de Egreso. cliente_final_id/
// punto_entrega_id solo tienen efecto en venta/gasto; en prestamo/reconteo se
// ignoran (no es un error, CA-01 dice que esos 2 tipos simplemente "no los usan").
export async function crearDocumentoEgreso(
  input: {
    tipo: TipoEgreso
    bodegaId: string
    clienteFinalId?: string | null
    puntoEntregaId?: string | null
    // Spec: HU-042 CA-04b — borrador de "Datos del traslado" (sin número, RN-09).
    datosTraslado?: Record<string, unknown> | null
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
      punto_entrega_id: permiteDestino ? (input.puntoEntregaId ?? null) : null,
      datos_traslado: input.datosTraslado ?? null,
      creado_por_id: actor.id,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al crear Documento de Egreso:', errDoc)
    return { ok: false, error: 'Error al crear el documento' }
  }

  const requiereGuia = await resolverRequiereGuiaLineas(input.lineas)
  const { error: errLineas } = await adminClient().from('documentos_egreso_items').insert(
    input.lineas.map((l, i) => ({
      documento_egreso_id: documento.id,
      producto_id: l.producto_id,
      cantidad: Number(l.cantidad),
      requiere_guia: requiereGuia[i],
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

type LineaEgresoMasiva = { producto_id: string; cantidad: number; costo_objetivo: number }

// Spec: HU-041 CA-06 — 1 solo Documento de Egreso tipo ajuste_masivo con
// TODAS las líneas de delta negativo (o solo-costo) de una ejecución de
// Reemplazo Total, en vez de 1 documento por producto. costo_objetivo
// (columna nueva, solo tiene efecto para este tipo) viaja con cada línea
// para que cerrarDocumentoEgreso() pueda reestatar el costo al cerrar.
export async function crearDocumentoEgresoMasivo(
  lineas: LineaEgresoMasiva[],
  bodegaId: string | null,
  actor: ActorEgreso
): Promise<ResultadoCreacion> {
  if (lineas.length === 0) return { ok: false, error: 'Sin líneas para el ajuste masivo' }

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_egreso', { p_year: año })
  const numero = `EGR-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: documento, error: errDoc } = await adminClient()
    .from('documentos_egreso')
    .insert({
      numero,
      bodega_id: bodegaId,
      tipo: 'ajuste_masivo',
      estado: 'generado',
      cliente_final_id: null,
      punto_entrega_id: null,
      creado_por_id: actor.id,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al crear Documento de Egreso de ajuste masivo:', errDoc)
    return { ok: false, error: 'Error al crear el documento' }
  }

  const { error: errLineas } = await adminClient().from('documentos_egreso_items').insert(
    lineas.map((l) => ({
      documento_egreso_id: documento.id,
      producto_id: l.producto_id,
      cantidad: Number(l.cantidad),
      costo_objetivo: Number(l.costo_objetivo),
    }))
  )
  if (errLineas) {
    console.error('Error al insertar líneas del ajuste masivo (egreso):', errLineas)
    return { ok: false, error: 'Error al guardar las líneas' }
  }

  await registrarAuditoria({
    accion: 'crear_documento_egreso_ajuste_masivo',
    entidad: 'documento_egreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { lineas: lineas.length, actor_rol: actor.rol },
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
    .select('id, producto_id, cantidad, costo_objetivo')
    .eq('documento_egreso_id', documentoId)

  const todasLasLineas = lineas ?? []
  if (todasLasLineas.length === 0) return { ok: false, error: 'El documento no tiene líneas' }

  // Spec: HU-041 RN-05 — un ajuste_masivo de solo-costo (saldo sin cambio,
  // costo distinto) permite cantidad=0. Cantidad negativa sigue inválida.
  const esAjusteMasivo = documento.tipo === 'ajuste_masivo'
  const cantidadInvalida = (cantidad: number) => (esAjusteMasivo ? cantidad < 0 : cantidad <= 0)
  if (todasLasLineas.some((l) => cantidadInvalida(Number(l.cantidad)))) {
    return { ok: false, error: 'Hay líneas con cantidad inválida' }
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
    // Spec: HU-041 RN-04 — un ajuste_masivo reestata el costo con el dato
    // directo del archivo maestro (costo_objetivo), nunca con el costo
    // vigente del producto como hace cualquier otra Salida (RN-BOD-07/082).
    const costoResultante = esAjusteMasivo ? Number(linea.costo_objetivo ?? costoActual) : costoActual

    const { error: errKardex } = await adminClient().from('kardex_movimientos').insert({
      producto_id: linea.producto_id,
      bodega_id: documento.bodega_id,
      direccion: 'salida',
      tipo: documento.tipo,
      cantidad,
      costo_unitario: costoResultante,
      saldo_resultante: nuevoSaldo,
      // Spec: RN-BOD-07/082 — la Salida nunca recalcula el promedio ponderado
      // (excepto ajuste_masivo, que reestata el costo directo — HU-041 RN-04).
      costo_promedio_resultante: costoResultante,
      documento_egreso_id: documentoId,
    })

    if (errKardex) {
      console.error('Error al generar movimiento de Kardex (egreso):', errKardex)
      return { ok: false, error: 'Error al generar el Kardex — el documento no se cerró, se puede reintentar' }
    }

    await adminClient().from('inventario').update({
      saldo_existencias: nuevoSaldo,
      ...(esAjusteMasivo ? { costo_unitario: costoResultante } : {}),
      // Spec: HU-034 CA-03 + HU-041 RN-07 — Reconteo y Ajuste Masivo
      // actualizan la fecha de último conteo físico; ningún otro tipo la toca.
      ...(documento.tipo === 'reconteo' || esAjusteMasivo
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
