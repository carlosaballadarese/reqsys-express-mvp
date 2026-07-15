import { adminClient } from '@/lib/supabase/clients'

export type Estado =
  | 'borrador' | 'pendiente' | 'aprobada' | 'rechazada' | 'devuelta'
  | 'en_gestion' | 'oc_directa' | 'oc_generada' | 'oc_en_aprobacion'
  | 'oc_aprobada' | 'completada'

// Spec: HU-009 RN-01 — solo estos valores se recalculan automáticamente.
// borrador/pendiente/rechazada/devuelta/completada son transiciones explícitas
// de otros endpoints (creación, aprobar NP, devolver, completar).
const ESTADOS_AUTOGESTIONADOS: Estado[] =
  ['aprobada', 'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada']

// Spec: HU-009 RN-02 — el SLA cuenta únicamente mientras el Estado está en este conjunto.
const ESTADOS_ACTIVOS_SLA: Estado[] = ['en_gestion', 'oc_directa']

// Estados en los que una NP todavía puede recibir OCs adicionales (selección parcial /
// multi-OC). No incluye 'aprobada' con exclusividad: una NP con comprador asignado deja
// 'aprobada' de inmediato pero sigue abierta a más OCs mientras no esté completada,
// rechazada, devuelta ni en borrador/pendiente. `verificarSobrecompra` es quien decide
// si realmente queda saldo, esto solo delimita en qué Estados tiene sentido intentarlo.
export const ESTADOS_NP_ABIERTA_A_OC: Estado[] =
  ['aprobada', 'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada']

// Spec: HU-009 CA-03 — orden de avance de una OC "viva" para determinar
// la menos avanzada entre las que cubren una NP.
const ORDEN_AVANCE_OC: Record<string, number> = {
  en_proceso: 0,
  en_aprobacion_compras: 1,
  en_aprobacion_gerencia: 1,
  aprobada: 2,
}
const ESTADOS_OC_VIVOS = Object.keys(ORDEN_AVANCE_OC)

// Spec: HU-009 RN-01 de HU-011 — Acción agregada de una NP = la de menor orden
// entre sus líneas (criterio conservador, unificado con RN-04 de HU-009).
export function calcularAccionAgregada(acciones: { orden: number }[]): number | null {
  if (acciones.length === 0) return null
  return Math.min(...acciones.map(a => a.orden))
}

type NPResumen = {
  id: string
  estado: string
  asignado_a: string | null
  prioridad: string | null
  sla_iniciado_en: string | null
  sla_pausado_desde: string | null
  sla_pausado_acumulado_seg: number | null
}

// Spec: HU-009 CA-03, RN-01, RN-02, RN-04
// Recalcula y persiste el Estado de una NP. No-op si el Estado actual no es
// autogestionado (borrador/pendiente/rechazada/devuelta/completada se ignoran).
export async function actualizarEstadoNP(np_id: string): Promise<void> {
  const { data: np } = await adminClient()
    .from('notas_pedido')
    .select('id, estado, asignado_a, prioridad, sla_iniciado_en, sla_pausado_desde, sla_pausado_acumulado_seg')
    .eq('id', np_id)
    .single()

  if (!np) return
  if (!ESTADOS_AUTOGESTIONADOS.includes(np.estado as Estado)) return

  const destino = await calcularEstadoDestino(np as NPResumen)
  if (destino === np.estado) return

  const update: Record<string, unknown> = { estado: destino }

  const salioDeActivo = ESTADOS_ACTIVOS_SLA.includes(np.estado as Estado) && !ESTADOS_ACTIVOS_SLA.includes(destino)
  const entroAActivo = !ESTADOS_ACTIVOS_SLA.includes(np.estado as Estado) && ESTADOS_ACTIVOS_SLA.includes(destino)

  // Spec: HU-009 RN-02 — pausar al salir de {en_gestion, oc_directa}
  if (salioDeActivo) {
    update.sla_pausado_desde = new Date().toISOString()
  }

  // Spec: HU-009 RN-02 — reactivar (o iniciar por primera vez) al entrar
  if (entroAActivo) {
    if (!np.sla_iniciado_en) {
      update.sla_iniciado_en = new Date().toISOString()
    }
    if (np.sla_pausado_desde) {
      const pausadoSeg = Math.floor((Date.now() - new Date(np.sla_pausado_desde).getTime()) / 1000)
      update.sla_pausado_acumulado_seg = (np.sla_pausado_acumulado_seg ?? 0) + pausadoSeg
      update.sla_pausado_desde = null
    }
  }

  await adminClient().from('notas_pedido').update(update).eq('id', np_id)

  await adminClient().from('historial_np').insert({
    np_id,
    estado: destino,
    actor_nombre: 'Sistema',
    actor_email: 'sistema@reqsys',
    notas: `Estado actualizado automáticamente a '${destino}'`,
  })
}

// Spec: HU-009 CA-04, RN-02 — pausa el SLA al cerrar administrativamente una NP
// (estado='completada', HU-006), sin pasar por la lógica de cobertura de OCs.
// Idempotente: no hace nada si el SLA nunca inició o ya está pausado.
export async function pausarSLAPorCierre(np_id: string): Promise<void> {
  const { data: np } = await adminClient()
    .from('notas_pedido')
    .select('sla_iniciado_en, sla_pausado_desde')
    .eq('id', np_id)
    .single()

  if (!np || !np.sla_iniciado_en || np.sla_pausado_desde) return

  await adminClient()
    .from('notas_pedido')
    .update({ sla_pausado_desde: new Date().toISOString() })
    .eq('id', np_id)
}

async function calcularEstadoDestino(np: NPResumen): Promise<Estado> {
  if (!np.asignado_a) return 'aprobada'

  const { data: itemsNp } = await adminClient()
    .from('items_np')
    .select('id')
    .eq('nota_pedido_id', np.id)

  const itemIds = (itemsNp ?? []).map(i => i.id)
  if (itemIds.length === 0) {
    return np.prioridad === 'excepcional' ? 'oc_directa' : 'en_gestion'
  }

  const { data: itemsOc } = await adminClient()
    .from('items_oc')
    .select('item_np_id, registro_compras_id')
    .in('item_np_id', itemIds)

  if (!itemsOc || itemsOc.length === 0) {
    return np.prioridad === 'excepcional' ? 'oc_directa' : 'en_gestion'
  }

  const ocIds = [...new Set(itemsOc.map(i => i.registro_compras_id))]
  const { data: ocs } = await adminClient()
    .from('registro_compras')
    .select('id, estado_oc')
    .in('id', ocIds)

  const estadoOcPorId: Record<string, string> = {}
  for (const oc of ocs ?? []) estadoOcPorId[oc.id] = oc.estado_oc

  // Spec: HU-009 RN-04 — una OC rechazada/cancelada no cuenta; si era la única
  // OC de una línea, esa línea vuelve a considerarse sin OC.
  const coberturaViva: Record<string, string[]> = {}
  for (const io of itemsOc) {
    const estadoOc = estadoOcPorId[io.registro_compras_id]
    if (estadoOc && ESTADOS_OC_VIVOS.includes(estadoOc)) {
      coberturaViva[io.item_np_id] = coberturaViva[io.item_np_id] ?? []
      coberturaViva[io.item_np_id].push(estadoOc)
    }
  }

  const todasLasLineasCubiertas = itemIds.every(id => (coberturaViva[id]?.length ?? 0) > 0)
  if (!todasLasLineasCubiertas) {
    return np.prioridad === 'excepcional' ? 'oc_directa' : 'en_gestion'
  }

  // Spec: HU-009 CA-03 — toma el estado_oc menos avanzado entre todas las OCs vivas
  const todosLosEstadosVivos = Object.values(coberturaViva).flat()
  const ordenMinimo = Math.min(...todosLosEstadosVivos.map(e => ORDEN_AVANCE_OC[e]))

  if (ordenMinimo === 0) return 'oc_generada'
  if (ordenMinimo === 1) return 'oc_en_aprobacion'
  return 'oc_aprobada'
}
