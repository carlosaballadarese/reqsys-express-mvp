import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularPromedioPonderado, resolverCostoUnitarioEfectivo } from '@/lib/bodega-kardex'

// Spec: HU-028 CA-03 — bodega/asistente_compras/compras/admin tienen el mismo
// permiso de lectura y escritura sobre Documentos de Ingreso (decisión de
// Fase 1 del usuario), con auditoría explícita de autoría en cada mutación.
const ROLES_INGRESO = ['bodega', 'asistente_compras', 'compras', 'admin']

export type AuthIngreso =
  | { ok: true; userId: string; rol: string; nombre: string; email: string }
  | { ok: false; status: 401 | 403 }

export async function verificarAutorizacionIngreso(): Promise<AuthIngreso> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol, nombre, email')
    .eq('id', user.id)
    .single()

  if (!perfil || !ROLES_INGRESO.includes(perfil.rol)) return { ok: false, status: 403 }

  return { ok: true, userId: user.id, rol: perfil.rol, nombre: perfil.nombre, email: perfil.email }
}

type ActorIngreso = { id: string; nombre: string; email: string; rol: string }

type ItemOcParaIngreso = {
  codigo: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  tipo: string | null
}

// Spec: HU-028 CA-01/CA-01b — al aprobar una OC, genera su Documento de
// Ingreso automático. Ningún ítem SERVICIOS genera línea (no hay concepto de
// stock); los ítems BIENES sin match real de inventario igual generan línea
// (producto_id=NULL, "sin producto vinculado") para no perder trazabilidad de
// algo realmente comprado — bloquean el cierre hasta resolverse (CA-05).
export async function generarDocumentoIngresoDesdeOC(
  registroComprasId: string,
  actor: ActorIngreso
): Promise<{ documentoId: string; numero: string } | null> {
  const { data: itemsOc } = await adminClient()
    .from('items_oc')
    .select('codigo, descripcion, cantidad, precio_unitario, tipo')
    .eq('registro_compras_id', registroComprasId)

  const elegibles = ((itemsOc ?? []) as ItemOcParaIngreso[]).filter(
    (i) => i.tipo !== 'SERVICIOS'
  )
  if (elegibles.length === 0) return null

  const codigos = [...new Set(elegibles.map((i) => i.codigo).filter((c): c is string => !!c))]

  const productosPorCodigo = new Map<string, { id: string; bodega_id: string | null }>()
  if (codigos.length > 0) {
    const { data: productos } = await adminClient()
      .from('inventario')
      .select('id, codigo, bodega_id')
      .in('codigo', codigos)
    for (const p of productos ?? []) {
      productosPorCodigo.set(p.codigo, { id: p.id, bodega_id: p.bodega_id })
    }
  }

  // Spec: sdd-design.md — bodega de cabecera = la del primer ítem matcheado
  // con bodega asignada (caso de borde infrecuente de OC multi-bodega).
  let bodegaId: string | null = null
  for (const item of elegibles) {
    const producto = item.codigo ? productosPorCodigo.get(item.codigo) : undefined
    if (producto?.bodega_id) { bodegaId = producto.bodega_id; break }
  }

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_ingreso', { p_year: año })
  const numero = `ING-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: documento, error: errDoc } = await adminClient()
    .from('documentos_ingreso')
    .insert({
      numero,
      bodega_id: bodegaId,
      estado: 'generado',
      registro_compras_id: registroComprasId,
      creado_por_id: actor.id,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al generar Documento de Ingreso:', errDoc)
    return null
  }

  const lineas = elegibles.map((item) => {
    const producto = item.codigo ? productosPorCodigo.get(item.codigo) : undefined
    return {
      documento_ingreso_id: documento.id,
      producto_id: producto?.id ?? null,
      codigo_oc: item.codigo,
      descripcion_oc: item.descripcion,
      cantidad: Number(item.cantidad),
      costo_unitario: Number(item.precio_unitario),
    }
  })

  await adminClient().from('documentos_ingreso_items').insert(lineas)

  await registrarAuditoria({
    accion: 'generar_documento_ingreso',
    entidad: 'documento_ingreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { registro_compras_id: registroComprasId, lineas: lineas.length, actor_rol: actor.rol },
  })

  return { documentoId: documento.id, numero: documento.numero }
}

type LineaManual = { producto_id: string; cantidad: number; costo_unitario: number }
type ResultadoCreacionManual =
  | { ok: true; documentoId: string; numero: string }
  | { ok: false; error: string }

// Spec: HU-029 CA-01 — creación manual de un Documento de Ingreso tipo
// Devolución/Reconteo, sin OC de origen. A diferencia de
// generarDocumentoIngresoDesdeOC() (que admite producto_id=NULL para no
// perder trazabilidad de un ítem de OC sin match), aquí quien crea el
// documento elige el producto directamente del catálogo — no hay ningún
// código de OC ambiguo que preservar, así que producto_id es siempre
// obligatorio en cada línea.
export async function crearDocumentoIngresoManual(
  input: {
    tipoMovimiento: 'devolucion' | 'reconteo'
    bodegaId?: string | null
    lineas: LineaManual[]
    // Spec: HU-030 CA-05 — Documento de Egreso tipo Préstamo que esta
    // Devolución cierra (solo aplica si tipoMovimiento='devolucion').
    egresoPrestamoId?: string | null
  },
  actor: ActorIngreso
): Promise<ResultadoCreacionManual> {
  if (!['devolucion', 'reconteo'].includes(input.tipoMovimiento)) {
    return { ok: false, error: "tipo_movimiento debe ser 'devolucion' o 'reconteo'" }
  }
  if (input.lineas.length === 0) {
    return { ok: false, error: 'El documento debe tener al menos 1 línea' }
  }
  if (input.lineas.some((l) => !l.producto_id)) {
    return { ok: false, error: 'Toda línea requiere un producto vinculado (CA-01)' }
  }

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_ingreso', { p_year: año })
  const numero = `ING-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: documento, error: errDoc } = await adminClient()
    .from('documentos_ingreso')
    .insert({
      numero,
      bodega_id: input.bodegaId ?? null,
      estado: 'generado',
      tipo_movimiento: input.tipoMovimiento,
      registro_compras_id: null,
      egreso_prestamo_id: input.tipoMovimiento === 'devolucion' ? (input.egresoPrestamoId ?? null) : null,
      creado_por_id: actor.id,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al crear Documento de Ingreso manual:', errDoc)
    return { ok: false, error: 'Error al crear el documento' }
  }

  const { error: errLineas } = await adminClient().from('documentos_ingreso_items').insert(
    input.lineas.map((l) => ({
      documento_ingreso_id: documento.id,
      producto_id: l.producto_id,
      codigo_oc: null,
      descripcion_oc: `${input.tipoMovimiento === 'devolucion' ? 'Devolución' : 'Reconteo'} manual`,
      cantidad: Number(l.cantidad),
      costo_unitario: Number(l.costo_unitario),
    }))
  )
  if (errLineas) {
    console.error('Error al insertar líneas del Documento de Ingreso manual:', errLineas)
    return { ok: false, error: 'Error al guardar las líneas' }
  }

  await registrarAuditoria({
    accion: 'crear_documento_ingreso_manual',
    entidad: 'documento_ingreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { tipo_movimiento: input.tipoMovimiento, lineas: input.lineas.length, actor_rol: actor.rol },
  })

  return { ok: true, documentoId: documento.id, numero: documento.numero }
}

type ResultadoCierre =
  | { ok: true }
  | { ok: false; error: string; lineasInvalidas?: string[] }

// Spec: HU-028 CA-04/CA-05/CA-06 — cierra el documento, genera Kardex
// definitivo y recalcula saldo/costo promedio ponderado por producto.
// Secuencial (no Promise.all): si 2 líneas del mismo documento son del mismo
// producto, la segunda debe ver el saldo que dejó la primera.
export async function cerrarDocumentoIngreso(
  documentoId: string,
  actor: ActorIngreso
): Promise<ResultadoCierre> {
  const { data: documento } = await adminClient()
    .from('documentos_ingreso')
    .select('id, numero, estado, bodega_id, tipo_movimiento')
    .eq('id', documentoId)
    .single()

  if (!documento) return { ok: false, error: 'Documento de Ingreso no encontrado' }
  if (documento.estado === 'cerrado') return { ok: false, error: 'El documento ya está cerrado' }
  if (documento.estado === 'anulado') return { ok: false, error: 'El documento está anulado' }

  const { data: lineas } = await adminClient()
    .from('documentos_ingreso_items')
    .select('id, producto_id, descripcion_oc, cantidad, costo_unitario, es_importacion, costo_fob, factor_nacionalizacion')
    .eq('documento_ingreso_id', documentoId)

  const todasLasLineas = lineas ?? []
  if (todasLasLineas.length === 0) {
    return { ok: false, error: 'El documento no tiene líneas' }
  }

  // Spec: CA-05/RN-BOD-08, HU-032 CA-02b — bloqueo de cierre con datos
  // inválidos; para una línea de importación, el costo efectivo (FOB×Factor)
  // es el que debe ser válido, no el costo_unitario original de la OC.
  const lineasInvalidas = todasLasLineas
    .filter((l) => !l.producto_id || Number(l.cantidad) <= 0 || resolverCostoUnitarioEfectivo(l) <= 0)
    .map((l) => l.descripcion_oc)

  if (lineasInvalidas.length > 0) {
    return {
      ok: false,
      error: 'Hay líneas sin producto vinculado, con cantidad 0 o sin costo unitario válido',
      lineasInvalidas,
    }
  }

  // Spec: líneas ya procesadas en un reintento previo (fallo parcial) no se
  // vuelven a insertar en Kardex — guard idempotente por documento+producto.
  const { data: kardexYaGenerado } = await adminClient()
    .from('kardex_movimientos')
    .select('producto_id')
    .eq('documento_ingreso_id', documentoId)
  const productosYaProcesados = new Set((kardexYaGenerado ?? []).map((k) => k.producto_id))

  for (const linea of todasLasLineas) {
    if (productosYaProcesados.has(linea.producto_id)) continue

    const { data: producto } = await adminClient()
      .from('inventario')
      .select('saldo_existencias, costo_unitario')
      .eq('id', linea.producto_id)
      .single()

    const saldoAnterior = Number(producto?.saldo_existencias ?? 0)
    const costoPromedioAnterior = Number(producto?.costo_unitario ?? 0)
    const cantidad = Number(linea.cantidad)
    // Spec: HU-032 CA-02 — costo landed (FOB×Factor) sobreescribe el
    // costo_unitario pactado en la OC para líneas marcadas como importación.
    const costoUnitario = resolverCostoUnitarioEfectivo(linea)

    const nuevoPromedio = calcularPromedioPonderado(
      saldoAnterior, costoPromedioAnterior, cantidad, costoUnitario
    )
    const nuevoSaldo = saldoAnterior + cantidad

    const { error: errKardex } = await adminClient().from('kardex_movimientos').insert({
      producto_id: linea.producto_id,
      bodega_id: documento.bodega_id,
      direccion: 'entrada',
      // Spec: HU-029 CA-02 — parametrizado por el tipo del documento (antes
      // hardcodeado a 'compra', único tipo que existía antes de esta HU).
      tipo: documento.tipo_movimiento,
      cantidad,
      costo_unitario: costoUnitario,
      saldo_resultante: nuevoSaldo,
      costo_promedio_resultante: nuevoPromedio,
      documento_ingreso_id: documentoId,
    })

    if (errKardex) {
      console.error('Error al generar movimiento de Kardex:', errKardex)
      return { ok: false, error: 'Error al generar el Kardex — el documento no se cerró, se puede reintentar' }
    }

    await adminClient()
      .from('inventario')
      .update({
        saldo_existencias: nuevoSaldo,
        costo_unitario: nuevoPromedio,
        // Spec: HU-034 CA-03 — un Reconteo actualiza la fecha de último
        // conteo físico; ningún otro tipo de movimiento la toca.
        ...(documento.tipo_movimiento === 'reconteo'
          ? { ultimo_conteo_fecha: new Date().toISOString().slice(0, 10) }
          : {}),
      })
      .eq('id', linea.producto_id)
  }

  await adminClient()
    .from('documentos_ingreso')
    .update({ estado: 'cerrado', cerrado_por_id: actor.id, cerrado_en: new Date().toISOString() })
    .eq('id', documentoId)

  await registrarAuditoria({
    accion: 'cerrar_documento_ingreso',
    entidad: 'documento_ingreso',
    entidad_id: documentoId,
    referencia: documento.numero,
    detalle: { lineas: todasLasLineas.length, actor_rol: actor.rol },
  })

  return { ok: true }
}

// Spec: HU-028 CA-09 — al cancelar la OC de origen, cascada (sin Kardex aún)
// o bloqueo (Kardex ya generado) según el estado del Documento de Ingreso.
export async function resolverCancelacionIngresoPorOC(
  registroComprasId: string,
  motivo: string
): Promise<{ ok: true; anulado: boolean } | { ok: false; error: string }> {
  const { data: documento } = await adminClient()
    .from('documentos_ingreso')
    .select('id, numero, estado')
    .eq('registro_compras_id', registroComprasId)
    .maybeSingle()

  if (!documento) return { ok: true, anulado: false }

  if (documento.estado === 'cerrado') {
    return {
      ok: false,
      error:
        `No se puede cancelar: la OC ya generó el Documento de Ingreso ${documento.numero}, ` +
        `cerrado con movimientos de Kardex reales. Cualquier corrección debe hacerse con un ` +
        `movimiento de Reconteo, nunca cancelando retroactivamente la OC.`,
    }
  }

  if (documento.estado === 'anulado') return { ok: true, anulado: false }

  await adminClient()
    .from('documentos_ingreso')
    .update({ estado: 'anulado', motivo_anulacion: `OC cancelada: ${motivo}` })
    .eq('id', documento.id)

  await registrarAuditoria({
    accion: 'anular_documento_ingreso',
    entidad: 'documento_ingreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { motivo: `Cascada por cancelación de OC: ${motivo}` },
  })

  return { ok: true, anulado: true }
}
