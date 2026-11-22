import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionEgreso, type AuthEgreso } from '@/lib/bodega-egreso'

// Spec: HU-042 CA-20 — mismos roles que Documentos de Egreso (bodega/compras/admin).
export const verificarAutorizacionGuia: () => Promise<AuthEgreso> = verificarAutorizacionEgreso

// Spec: HU-042 RN-03 — solo venta/gasto/prestamo admiten guia; reconteo y
// ajuste_masivo (HU-041) son ajustes, no traslados.
export const TIPOS_EGRESO_CON_GUIA = ['venta', 'gasto', 'prestamo'] as const
export const MOTIVOS_GUIA = ['venta', 'renta', 'devolucion', 'consignacion', 'otros'] as const
export type MotivoGuia = (typeof MOTIVOS_GUIA)[number]

export function tipoAdmiteGuia(tipo: string): boolean {
  return (TIPOS_EGRESO_CON_GUIA as readonly string[]).includes(tipo)
}

// Spec: HU-042 CA-12 — motivo sugerido segun el tipo de egreso (editable por el usuario).
export function sugerirMotivo(tipoEgreso: string): MotivoGuia {
  if (tipoEgreso === 'venta') return 'venta'
  if (tipoEgreso === 'prestamo') return 'renta'
  return 'otros'
}

// Spec: HU-042 CA-06 — saldo por guiar derivado (sin columna), nunca negativo.
export function calcularSaldoPorGuiar(cantidadLinea: number, guiadoVigente: number): number {
  return Math.max(0, Number(cantidadLinea) - Number(guiadoVigente))
}

export function formatNumeroGuia(numero: number): string {
  return String(numero).padStart(7, '0')
}

type LineaGuiaInput = { egreso_item_id: string; cantidad: number; unidad?: string }

export type ResultadoValidacionLineas =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string; excedidas: string[] }

// Spec: HU-042 CA-05/CA-06/RN-06 — cada linea debe pertenecer al egreso, tener cantidad > 0 y
// no superar su saldo por guiar.
export function validarLineasGuia(
  lineas: LineaGuiaInput[],
  saldos: Map<string, number>
): ResultadoValidacionLineas {
  if (lineas.length === 0) {
    return { ok: false, status: 400, error: 'La guía debe tener al menos 1 línea', excedidas: [] }
  }
  const ajenas = lineas.filter((l) => !saldos.has(l.egreso_item_id)).map((l) => l.egreso_item_id)
  if (ajenas.length > 0) {
    return { ok: false, status: 400, error: 'Hay líneas que no pertenecen al egreso', excedidas: ajenas }
  }
  if (lineas.some((l) => !(Number(l.cantidad) > 0))) {
    return { ok: false, status: 400, error: 'Toda línea requiere cantidad mayor a 0', excedidas: [] }
  }
  const excedidas = lineas
    .filter((l) => Number(l.cantidad) > (saldos.get(l.egreso_item_id) ?? 0))
    .map((l) => l.egreso_item_id)
  if (excedidas.length > 0) {
    return {
      ok: false, status: 409,
      error: 'La cantidad supera el saldo por guiar de una o más líneas', excedidas,
    }
  }
  return { ok: true }
}

// Spec: HU-042 CA-22 — autorizacion vencida bloquea la emision. El tope de numeracion
// lo aplica la funcion SQL siguiente_numero_guia() para no consumir el numero.
export function validarVigenciaGuia(
  vigenciaHasta: string | null | undefined,
  ahora: Date = new Date()
): { ok: true } | { ok: false; error: string } {
  if (!vigenciaHasta) return { ok: true }
  const hoy = ahora.toISOString().slice(0, 10)
  if (hoy > vigenciaHasta) {
    return { ok: false, error: `La autorización de guías de remisión venció el ${vigenciaHasta}` }
  }
  return { ok: true }
}

export type DatosTraslado = {
  fecha_inicio_traslado?: string | null
  fecha_fin_traslado?: string | null
  punto_partida?: string | null
  punto_llegada?: string | null
  motivo?: string | null
  motivo_otros?: string | null
  numero_referencia?: string | null
  comentarios?: string | null
  cliente_final_id?: string | null
  punto_entrega_id?: string | null
  destinatario_nombre?: string | null
  destinatario_ruc?: string | null
  transportista_id?: string | null
  transportista_nombre?: string | null
  transportista_identificacion?: string | null
  placa?: string | null
}

export type InputEmitirGuia = DatosTraslado & { lineas?: LineaGuiaInput[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

// Spec: HU-042 CA-09/CA-10/CA-11 — campos obligatorios de la guia.
export function validarDatosGuia(d: DatosTraslado): string | null {
  if (vacio(d.punto_llegada)) return 'El punto de llegada es requerido'
  if (vacio(d.motivo) || !(MOTIVOS_GUIA as readonly string[]).includes(String(d.motivo))) {
    return 'El motivo de traslado es requerido'
  }
  if (d.motivo === 'otros' && vacio(d.motivo_otros)) return 'Describe el motivo cuando es "Otros"'
  if (vacio(d.destinatario_nombre)) return 'El destinatario es requerido'
  if (vacio(d.transportista_nombre)) return 'El transportista es requerido'
  if (vacio(d.transportista_identificacion)) return 'La cédula/RUC del transportista es requerida'
  if (vacio(d.placa)) return 'La placa del vehículo es requerida'
  return null
}

type ActorGuia = { id: string; nombre: string; email: string; rol: string }

export type ResultadoEmision =
  | { ok: true; guiaId: string; numero: number }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; excedidas?: string[] }

// Spec: HU-042 CA-04/CA-05/CA-06/CA-08 — emite una guia sobre un egreso cerrado.
// No toca Kardex ni saldos (CA-19). Reutilizada por el cierre ("Cerrar y generar guia")
// y por la emision posterior desde un egreso cerrado.
export async function emitirGuia(
  egresoId: string,
  input: InputEmitirGuia,
  actor: ActorGuia
): Promise<ResultadoEmision> {
  const { data: egreso } = await adminClient()
    .from('documentos_egreso')
    .select('id, numero, estado, tipo, datos_traslado')
    .eq('id', egresoId)
    .single()

  if (!egreso) return { ok: false, status: 404, error: 'Documento de Egreso no encontrado' }
  if (egreso.estado !== 'cerrado') {
    return { ok: false, status: 409, error: 'La guía solo se emite sobre un egreso cerrado' }
  }
  if (!tipoAdmiteGuia(egreso.tipo)) {
    return { ok: false, status: 400, error: 'Este tipo de egreso no admite guía de remisión' }
  }

  // El input explicito prevalece sobre el borrador del egreso (RN-09).
  const borrador = (egreso.datos_traslado ?? {}) as DatosTraslado
  const datos: DatosTraslado = { ...borrador }
  for (const [k, v] of Object.entries(input)) {
    if (k !== 'lineas' && v !== undefined) (datos as Record<string, unknown>)[k] = v
  }

  const { data: config } = await adminClient()
    .from('configuracion_empresa')
    .select('guia_serie, guia_punto_partida_defecto, guia_numero_hasta, guia_vigencia_hasta')
    .eq('id', 1)
    .single()

  // Spec: HU-042 CA-12 — sin motivo explícito se usa el sugerido según el tipo de egreso.
  if (vacio(datos.motivo)) datos.motivo = sugerirMotivo(egreso.tipo)
  if (vacio(datos.punto_partida)) datos.punto_partida = config?.guia_punto_partida_defecto ?? 'BASE ARLIFT'
  const hoy = new Date().toISOString().slice(0, 10)
  if (vacio(datos.fecha_inicio_traslado)) datos.fecha_inicio_traslado = hoy
  if (vacio(datos.fecha_fin_traslado)) datos.fecha_fin_traslado = datos.fecha_inicio_traslado

  const errorDatos = validarDatosGuia(datos)
  if (errorDatos) return { ok: false, status: 400, error: errorDatos }

  // Los identificadores opcionales (catálogos) llegan desde formularios: '' significa "sin
  // elegir" y debe guardarse como NULL (un '' en una columna uuid rompe el INSERT con 500
  // DESPUÉS de haber consumido el número). Se valida formato y existencia ANTES de numerar.
  const referencias = [
    { campo: 'cliente_final_id', tabla: 'clientes_finales', etiqueta: 'El cliente final' },
    { campo: 'punto_entrega_id', tabla: 'puntos_entrega', etiqueta: 'El lugar de entrega' },
    { campo: 'transportista_id', tabla: 'transportistas', etiqueta: 'El transportista' },
  ] as const
  for (const ref of referencias) {
    const valor = datos[ref.campo]
    if (vacio(valor)) { datos[ref.campo] = null; continue }
    const id = String(valor).trim()
    if (!UUID_RE.test(id)) return { ok: false, status: 400, error: `${ref.etiqueta} seleccionado no es válido` }
    const { data: existe } = await adminClient().from(ref.tabla).select('id').eq('id', id).single()
    if (!existe) return { ok: false, status: 400, error: `${ref.etiqueta} seleccionado no existe` }
    datos[ref.campo] = id
  }

  const vigencia = validarVigenciaGuia(config?.guia_vigencia_hasta)
  if (!vigencia.ok) return { ok: false, status: 409, error: vigencia.error }

  // Lineas del egreso + saldo por guiar (derivado de guias vigentes).
  const { data: lineasEgreso } = await adminClient()
    .from('documentos_egreso_items')
    .select('id, producto_id, cantidad, requiere_guia')
    .eq('documento_egreso_id', egresoId)

  const itemsEgreso = lineasEgreso ?? []
  const { data: guiasVigentes } = await adminClient()
    .from('guias_remision')
    .select('id')
    .eq('documento_egreso_id', egresoId)
    .eq('estado', 'emitida')

  const guiadoPorItem = new Map<string, number>()
  const idsGuias = (guiasVigentes ?? []).map((g) => g.id)
  if (idsGuias.length > 0) {
    const { data: itemsGuiados } = await adminClient()
      .from('guias_remision_items')
      .select('egreso_item_id, cantidad')
      .in('guia_id', idsGuias)
    for (const it of itemsGuiados ?? []) {
      guiadoPorItem.set(it.egreso_item_id, (guiadoPorItem.get(it.egreso_item_id) ?? 0) + Number(it.cantidad))
    }
  }

  const saldos = new Map<string, number>(
    itemsEgreso.map((l) => [l.id, calcularSaldoPorGuiar(Number(l.cantidad), guiadoPorItem.get(l.id) ?? 0)])
  )

  // Sin lineas explicitas: todas las marcadas "requiere guia" con saldo > 0 (CA-04c).
  const lineasGuia: LineaGuiaInput[] = input.lineas ?? itemsEgreso
    .filter((l) => l.requiere_guia && (saldos.get(l.id) ?? 0) > 0)
    .map((l) => ({ egreso_item_id: l.id, cantidad: saldos.get(l.id) ?? 0 }))

  const validacion = validarLineasGuia(lineasGuia, saldos)
  if (!validacion.ok) {
    return { ok: false, status: validacion.status, error: validacion.error, excedidas: validacion.excedidas }
  }

  const productoIds = [...new Set(itemsEgreso.map((l) => l.producto_id))]
  const { data: productos } = await adminClient()
    .from('inventario')
    .select('id, codigo, descripcion, unidad')
    .in('id', productoIds)
  const productoPorId = new Map((productos ?? []).map((p) => [p.id, p]))
  const itemPorId = new Map(itemsEgreso.map((l) => [l.id, l]))

  // Numeracion atomica; el tope (si existe) lo aplica la funcion SQL (CA-08, CA-22).
  const { data: numeroData, error: errNumero } = await adminClient().rpc('siguiente_numero_guia', {
    p_hasta: config?.guia_numero_hasta ?? null,
  })
  if (errNumero) {
    if (String(errNumero.message).includes('GUIA_RANGO_AGOTADO')) {
      return { ok: false, status: 409, error: 'Se agotó el rango autorizado de numeración de guías' }
    }
    console.error('Error al obtener número de guía:', errNumero)
    return { ok: false, status: 500, error: 'Error al asignar el número de guía' }
  }
  const numero = Number(numeroData)

  const { data: guia, error: errGuia } = await adminClient()
    .from('guias_remision')
    .insert({
      numero,
      serie: config?.guia_serie ?? '001-001',
      estado: 'emitida',
      documento_egreso_id: egresoId,
      fecha_inicio_traslado: datos.fecha_inicio_traslado,
      fecha_fin_traslado: datos.fecha_fin_traslado,
      punto_partida: String(datos.punto_partida).trim(),
      punto_llegada: String(datos.punto_llegada).trim(),
      motivo: datos.motivo,
      motivo_otros: datos.motivo === 'otros' ? String(datos.motivo_otros).trim() : null,
      numero_referencia: vacio(datos.numero_referencia) ? null : String(datos.numero_referencia).trim(),
      comentarios: vacio(datos.comentarios) ? null : String(datos.comentarios).trim(),
      cliente_final_id: datos.cliente_final_id ?? null,
      punto_entrega_id: datos.punto_entrega_id ?? null,
      destinatario_nombre: String(datos.destinatario_nombre).trim(),
      destinatario_ruc: vacio(datos.destinatario_ruc) ? null : String(datos.destinatario_ruc).trim(),
      transportista_id: datos.transportista_id ?? null,
      transportista_nombre: String(datos.transportista_nombre).trim(),
      transportista_identificacion: String(datos.transportista_identificacion).trim(),
      placa: String(datos.placa).trim().toUpperCase(),
      despachado_por_id: actor.id,
      despachado_por_nombre: actor.nombre,
      creado_por_id: actor.id,
    })
    .select('id')
    .single()

  if (errGuia || !guia) {
    // El número ya se consumió: queda registrado en el log para poder justificar el hueco.
    console.error(`Error al crear guía de remisión (número ${numero} consumido sin guía):`, errGuia)
    return { ok: false, status: 500, error: 'Error al crear la guía' }
  }

  const filas = lineasGuia.map((l, idx) => {
    const item = itemPorId.get(l.egreso_item_id)!
    const prod = productoPorId.get(item.producto_id)
    return {
      guia_id: guia.id,
      egreso_item_id: l.egreso_item_id,
      producto_id: item.producto_id,
      linea: idx + 1,
      codigo: prod?.codigo ?? '',
      descripcion: prod?.descripcion ?? '',
      unidad: (l.unidad && String(l.unidad).trim()) || prod?.unidad || 'EA',
      cantidad: Number(l.cantidad),
    }
  })

  const { error: errItems } = await adminClient().from('guias_remision_items').insert(filas)
  if (errItems) {
    console.error('Error al insertar líneas de la guía:', errItems)
    // RN-04: el numero no se reutiliza; la guia queda anulada con motivo justificado.
    await adminClient().from('guias_remision').update({
      estado: 'anulada',
      motivo_anulacion: 'Error de emisión: no se pudieron guardar las líneas',
      anulada_por_id: actor.id,
      anulada_en: new Date().toISOString(),
    }).eq('id', guia.id)
    return { ok: false, status: 500, error: 'Error al guardar las líneas de la guía' }
  }

  await registrarAuditoria({
    accion: 'emitir_guia_remision',
    entidad: 'guia_remision',
    entidad_id: guia.id,
    referencia: formatNumeroGuia(numero),
    detalle: { egreso: egreso.numero, lineas: filas.length, motivo: datos.motivo, actor_rol: actor.rol },
  })

  return { ok: true, guiaId: guia.id, numero }
}

export type ResultadoAnulacion = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string }

// Spec: HU-042 CA-16/CA-17 — anula con motivo; el numero no se reutiliza y las
// cantidades vuelven a quedar disponibles (saldo derivado solo de guias 'emitida').
export async function anularGuia(
  guiaId: string,
  motivo: string,
  actor: ActorGuia
): Promise<ResultadoAnulacion> {
  if (!motivo?.trim()) return { ok: false, status: 400, error: 'El motivo de anulación es obligatorio' }

  const { data: guia } = await adminClient()
    .from('guias_remision')
    .select('id, numero, estado')
    .eq('id', guiaId)
    .single()

  if (!guia) return { ok: false, status: 404, error: 'Guía no encontrada' }
  if (guia.estado === 'anulada') return { ok: false, status: 409, error: 'La guía ya está anulada' }

  const { error } = await adminClient().from('guias_remision').update({
    estado: 'anulada',
    motivo_anulacion: motivo.trim(),
    anulada_por_id: actor.id,
    anulada_en: new Date().toISOString(),
  }).eq('id', guiaId)

  if (error) return { ok: false, status: 409, error: 'No se pudo anular la guía' }

  await registrarAuditoria({
    accion: 'anular_guia_remision',
    entidad: 'guia_remision',
    entidad_id: guiaId,
    referencia: formatNumeroGuia(guia.numero),
    detalle: { motivo: motivo.trim(), actor_rol: actor.rol },
  })

  return { ok: true }
}
