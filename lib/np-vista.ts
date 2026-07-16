import { type Estado, ESTADOS_OC_VIVOS, calcularAccionAgregada } from '@/lib/np-estado'

export type SlaBadge = 'no_activo' | 'pausado' | 'a_tiempo' | 'vencido'

// Spec: HU-009 RN-02 — mismo criterio que actualizarEstadoNP()/calcularSLA().
const ESTADOS_ACTIVOS_SLA: Estado[] = ['en_gestion', 'oc_directa']
// Spec: HU-011 CA-07 — Estados en los que el badge puede leer "Pausado".
const ESTADOS_PAUSABLES: Estado[] = ['oc_generada', 'oc_en_aprobacion', 'oc_aprobada', 'completada']

// Spec: HU-011 CA-07 — clasifica el badge de SLA a partir del Estado y los campos
// ya resueltos (transcurridoMs/plazoMs se calculan antes con diasHabilesEntreSync
// para todo el lote, ver lib/np-sla.ts).
export function clasificarBadgeSLA(params: {
  estado: Estado
  slaIniciadoEn: string | null
  slaPausadoDesde: string | null
  transcurridoMs: number | null
  plazoMs: number | null
}): SlaBadge {
  const { estado, slaIniciadoEn, slaPausadoDesde, transcurridoMs, plazoMs } = params

  // Spec CA-07: sin sla_iniciado_en la NP nunca fue asignada — "No activo" sin
  // importar el Estado.
  if (!slaIniciadoEn) return 'no_activo'

  if (ESTADOS_PAUSABLES.includes(estado) && slaPausadoDesde) return 'pausado'

  if (ESTADOS_ACTIVOS_SLA.includes(estado) && transcurridoMs !== null && plazoMs !== null) {
    return transcurridoMs > plazoMs ? 'vencido' : 'a_tiempo'
  }

  return 'no_activo'
}

type AccionCatalogo = { id: string; orden: number; descripcion: string }

// Spec: HU-011 RN-01 — Acción agregada de la fila = la de menor orden entre sus
// líneas. No aplica fuera de 'en_gestion' (oc_directa no usa Acciones, RN-05 de HU-009).
export function accionAgregadaDeFila(
  estado: Estado,
  lineas: { accion_id: string | null }[],
  catalogo: Map<string, AccionCatalogo>
): AccionCatalogo | null {
  if (estado !== 'en_gestion') return null

  const acciones = lineas
    .map(l => (l.accion_id ? catalogo.get(l.accion_id) : undefined))
    .filter((a): a is AccionCatalogo => a !== undefined)

  if (acciones.length === 0) return null

  const ordenMin = calcularAccionAgregada(acciones)
  return acciones.find(a => a.orden === ordenMin) ?? null
}

export type OcDeLinea = { id: string; numero_oc: string }

// Spec: HU-011 CA-03, RN-02 — N° de OC de una línea considerando solo OCs vivas
// (mismo criterio ESTADOS_OC_VIVOS que actualizarEstadoNP()). Una OC rechazada o
// cancelada no cubre la línea a estos efectos, aunque exista históricamente.
// Incluye el id de la OC (no solo el número) para que la UI pueda enlazar a
// /compras/ordenes/[id].
export function ocVivaDeLinea(
  itemNpId: string,
  ocsPorItem: Map<string, { id: string; numero_oc: string; estado_oc: string }[]>
): OcDeLinea | null {
  const ocs = ocsPorItem.get(itemNpId) ?? []
  const viva = ocs.find(oc => ESTADOS_OC_VIVOS.includes(oc.estado_oc))
  return viva ? { id: viva.id, numero_oc: viva.numero_oc } : null
}

// Spec: HU-011 CA-08 — envoltorio delgado sobre puedeVerPrecioNP para no repetir
// la forma del masking en cada punto del route handler.
export function aplicarMaskingPrecio<T extends { precio_unitario?: number | null }>(
  item: T,
  verPrecio: boolean
): T {
  return verPrecio ? item : { ...item, precio_unitario: null }
}
