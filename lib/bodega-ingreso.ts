import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularPromedioPonderado, resolverCostoUnitarioEfectivo } from '@/lib/bodega-kardex'
// Spec: HU-046 — import en una sola dirección (bodega-egreso.ts no importa
// nada de este archivo, confirmado en sdd-design.md Decisión 1).
import { crearDocumentoEgresoMasivo, cerrarDocumentoEgreso } from '@/lib/bodega-egreso'

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

type LineaMasiva = { producto_id: string; cantidad: number; costo_unitario: number }
type ResultadoCreacionMasiva =
  | { ok: true; documentoId: string; numero: string }
  | { ok: false; error: string }

// Spec: HU-041 CA-06 — 1 solo Documento de Ingreso con TODAS las líneas de
// delta positivo (o solo-costo) de una ejecución de Reemplazo Total, en vez
// de 1 documento por producto. Reutiliza cerrarDocumentoIngreso() tal cual
// (ya procesa N líneas secuencialmente).
// Spec: HU-046 — `tipo` y `observaciones` generalizados (antes
// 'ajuste_masivo' hardcodeado); default preserva el comportamiento exacto de
// HU-041, ningún call site existente necesita cambiar.
export async function crearDocumentoIngresoMasivo(
  lineas: LineaMasiva[],
  bodegaId: string | null,
  actor: ActorIngreso,
  tipo: 'ajuste_masivo' | 'reconteo' = 'ajuste_masivo',
  observaciones?: string
): Promise<ResultadoCreacionMasiva> {
  if (lineas.length === 0) return { ok: false, error: 'Sin líneas para el ajuste masivo' }

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_ingreso', { p_year: año })
  const numero = `ING-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: documento, error: errDoc } = await adminClient()
    .from('documentos_ingreso')
    .insert({
      numero,
      bodega_id: bodegaId,
      estado: 'generado',
      tipo_movimiento: tipo,
      registro_compras_id: null,
      creado_por_id: actor.id,
      observaciones: observaciones ?? null,
    })
    .select('id, numero')
    .single()

  if (errDoc || !documento) {
    console.error('Error al crear Documento de Ingreso de ajuste masivo:', errDoc)
    return { ok: false, error: 'Error al crear el documento' }
  }

  const descripcionLinea = tipo === 'reconteo'
    ? 'Ajuste automático de costo cero'
    : 'Ajuste masivo — Reemplazo Total de Inventario'

  const { error: errLineas } = await adminClient().from('documentos_ingreso_items').insert(
    lineas.map((l) => ({
      documento_ingreso_id: documento.id,
      producto_id: l.producto_id,
      codigo_oc: null,
      descripcion_oc: descripcionLinea,
      cantidad: Number(l.cantidad),
      costo_unitario: Number(l.costo_unitario),
    }))
  )
  if (errLineas) {
    console.error('Error al insertar líneas del ajuste masivo (ingreso):', errLineas)
    return { ok: false, error: 'Error al guardar las líneas' }
  }

  await registrarAuditoria({
    accion: tipo === 'reconteo' ? 'crear_documento_ingreso_correccion_costo_cero' : 'crear_documento_ingreso_ajuste_masivo',
    entidad: 'documento_ingreso',
    entidad_id: documento.id,
    referencia: documento.numero,
    detalle: { lineas: lineas.length, actor_rol: actor.rol },
  })

  return { ok: true, documentoId: documento.id, numero: documento.numero }
}

export type ResultadoCorreccionCostoCero =
  | { corregido: true; ingresoNumero: string; egresoNumero: string }
  | { corregido: false; motivo?: string }

// Spec: HU-046 CA-02/CA-03/CA-05/RN-01 — orquestador compartido entre
// cerrarDocumentoIngreso() (abajo) y confirmarOrdenEnsamblaje()
// (lib/bodega-ensamblaje.ts). Co-localizada aquí (no en lib/bodega-kardex.ts)
// para evitar un import circular — necesita llamar de vuelta a
// crearDocumentoIngresoMasivo/cerrarDocumentoIngreso, ambas de este mismo
// archivo (ver sdd-design.md, Decisión 1). Importa de bodega-egreso.ts en una
// sola dirección (confirmado sin dependencia inversa).
export async function generarCorreccionCostoCeroSiAplica(params: {
  productoId: string
  saldoActual: number
  costoActual: number
  costoReal: number
  bodegaId: string | null
  actor: ActorIngreso
  referenciaDisparador: string
}): Promise<ResultadoCorreccionCostoCero> {
  const { productoId, saldoActual, costoActual, costoReal, actor, referenciaDisparador } = params

  // Spec: RN-01 — condición exacta de disparo.
  if (!(saldoActual > 0 && costoActual === 0 && costoReal > 0)) return { corregido: false }

  // Spec: hallazgo real de Fase 4 — documentos_egreso.bodega_id es NOT NULL
  // (HU-030 CA-01), pero documentos_ingreso.bodega_id es nullable; el
  // disparador puede no traer bodega (producto aún sin asignar — deuda
  // pendiente de HU-027/041). Se intenta resolver con la bodega del propio
  // producto; si tampoco existe, se omite la corrección (best-effort, nunca
  // bloquea la línea real) y queda registrada en Auditoría para seguimiento.
  let bodegaId = params.bodegaId
  if (!bodegaId) {
    const { data: producto } = await adminClient().from('inventario').select('bodega_id').eq('id', productoId).single()
    bodegaId = producto?.bodega_id ?? null
  }
  if (!bodegaId) {
    await registrarAuditoria({
      accion: 'correccion_costo_cero_omitida_sin_bodega',
      entidad: 'inventario',
      entidad_id: productoId,
      referencia: referenciaDisparador,
      detalle: { saldoActual, costoReal, actor_rol: actor.rol },
    })
    return { corregido: false, motivo: 'sin_bodega' }
  }

  const observaciones = `Ajuste automático de costo cero — generado junto con ${referenciaDisparador}`

  const egreso = await crearDocumentoEgresoMasivo(
    [{ producto_id: productoId, cantidad: saldoActual, costo_objetivo: 0 }],
    bodegaId, actor, 'reconteo', observaciones
  )
  if (!egreso.ok) return { corregido: false, motivo: egreso.error }
  const cierreEgreso = await cerrarDocumentoEgreso(egreso.documentoId, actor)
  if (!cierreEgreso.ok) return { corregido: false, motivo: cierreEgreso.error }

  const ingreso = await crearDocumentoIngresoMasivo(
    [{ producto_id: productoId, cantidad: saldoActual, costo_unitario: costoReal }],
    bodegaId, actor, 'reconteo', observaciones
  )
  if (!ingreso.ok) return { corregido: false, motivo: ingreso.error }
  const cierreIngreso = await cerrarDocumentoIngreso(ingreso.documentoId, actor)
  if (!cierreIngreso.ok) return { corregido: false, motivo: cierreIngreso.error }

  return { corregido: true, ingresoNumero: ingreso.numero, egresoNumero: egreso.numero }
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

  // Spec: HU-041 RN-05 — un ajuste_masivo de solo-costo (saldo sin cambio,
  // costo distinto) es un evento real de revaluación; se permite cantidad=0
  // únicamente para este tipo. Cantidad negativa sigue inválida siempre.
  const esAjusteMasivo = documento.tipo_movimiento === 'ajuste_masivo'
  const cantidadInvalida = (cantidad: number) => (esAjusteMasivo ? cantidad < 0 : cantidad <= 0)
  // Spec: HU-046 — hallazgo real de ejecución (no detectado por los tests
  // unitarios de HU-041/045, que mockean cerrarDocumentoIngreso de forma
  // aislada): un archivo maestro real puede traer una alta o un ajuste con
  // costo=0 (dato no capturado — mismo criterio ya aceptado en HU-036 para
  // el histórico), y esa línea viaja en el ÚNICO Documento de Ingreso
  // combinado de la ejecución (CA-06 de HU-041) — sin esta excepción,
  // bloquearía el cierre de TODO el lote, no solo de la línea en costo 0.
  // Un Ingreso real operativo (compra/devolucion/reconteo) sigue exigiendo
  // costo > 0 siempre: ahí no hay "archivo maestro" que justifique un 0.
  const costoInvalido = (costo: number) => (esAjusteMasivo ? costo < 0 : costo <= 0)

  // Spec: CA-05/RN-BOD-08, HU-032 CA-02b — bloqueo de cierre con datos
  // inválidos; para una línea de importación, el costo efectivo (FOB×Factor)
  // es el que debe ser válido, no el costo_unitario original de la OC.
  const lineasInvalidas = todasLasLineas
    .filter((l) => !l.producto_id || cantidadInvalida(Number(l.cantidad)) || costoInvalido(resolverCostoUnitarioEfectivo(l)))
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

    let saldoAnterior = Number(producto?.saldo_existencias ?? 0)
    let costoPromedioAnterior = Number(producto?.costo_unitario ?? 0)
    const cantidad = Number(linea.cantidad)
    // Spec: HU-032 CA-02 — costo landed (FOB×Factor) sobreescribe el
    // costo_unitario pactado en la OC para líneas marcadas como importación.
    const costoUnitario = resolverCostoUnitarioEfectivo(linea)

    // Spec: HU-046 CA-02 — antes de promediar, corrige si el producto está
    // "atascado" en costo cero (ver generarCorreccionCostoCeroSiAplica más
    // arriba); nunca aplica a ajuste_masivo (RN-04/CA-07, ese tipo ya fija el
    // costo directo del archivo sin promediar). Tras la corrección, se
    // relee el producto — el par de corrección ya cambió su saldo/costo.
    if (!esAjusteMasivo) {
      const correccion = await generarCorreccionCostoCeroSiAplica({
        productoId: linea.producto_id,
        saldoActual: saldoAnterior,
        costoActual: costoPromedioAnterior,
        costoReal: costoUnitario,
        bodegaId: documento.bodega_id,
        actor,
        referenciaDisparador: `Ingreso ${documento.numero}`,
      })
      if (correccion.corregido) {
        const { data: productoCorregido } = await adminClient()
          .from('inventario')
          .select('saldo_existencias, costo_unitario')
          .eq('id', linea.producto_id)
          .single()
        saldoAnterior = Number(productoCorregido?.saldo_existencias ?? 0)
        costoPromedioAnterior = Number(productoCorregido?.costo_unitario ?? 0)
      }
    }

    // Spec: HU-041 RN-04 — un ajuste_masivo reestata el costo con el dato
    // directo del archivo maestro, nunca mezclado/promediado con el historial
    // previo del producto (a diferencia de un reconteo puntual).
    const nuevoPromedio = esAjusteMasivo
      ? costoUnitario
      : calcularPromedioPonderado(saldoAnterior, costoPromedioAnterior, cantidad, costoUnitario)
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
        // Spec: HU-034 CA-03 + HU-041 RN-07 — Reconteo y Ajuste Masivo
        // actualizan la fecha de último conteo físico; ningún otro tipo la toca.
        ...(documento.tipo_movimiento === 'reconteo' || esAjusteMasivo
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
