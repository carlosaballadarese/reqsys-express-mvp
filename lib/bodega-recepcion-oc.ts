import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-047 — mismo patrón `enLotes` ya establecido en el proyecto
// (lib/oc-np-origen.ts, lib/np-lineas-pendientes-query.ts,
// lib/reporte-lineas-np-query.ts), replicado local a este archivo.
const LOTE = 100
function enLotes<T>(items: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += LOTE) lotes.push(items.slice(i, i + LOTE))
  return lotes
}

export type ItemCoberturaOC = {
  item_oc_id:        string
  linea:             number
  descripcion:       string
  cantidad_comprada: number
  cantidad_recibida: number
  saldo:             number
  porcentaje:        number
  // Spec: RN-04/CA-05 — sobre-recepción, nunca bloqueante, solo informativa.
  sobre_recepcion:   boolean
}

export type CoberturaRecepcionResult = {
  por_item:        ItemCoberturaOC[]
  oc_recibida_100: boolean
}

// Spec: HU-047 CA-03/CA-04/CA-06/CA-07, RN-01/RN-02 — análoga exacta a
// calcularCoberturaNP() (lib/np-cobertura.ts), aplicada al lado OC→Ingreso.
// Solo cuenta items_oc.tipo != 'SERVICIOS' (CA-06, sin concepto de stock).
// cantidad_recibida se acumula vía documentos_ingreso_items.item_oc_id, solo
// de Documentos de Ingreso en estado 'cerrado' (RN-02 — Kardex real escrito).
export async function calcularCoberturaRecepcionOC(
  registroComprasId: string
): Promise<CoberturaRecepcionResult> {
  const { data: itemsOcRaw } = await adminClient()
    .from('items_oc')
    .select('id, linea, descripcion, cantidad, tipo')
    .eq('registro_compras_id', registroComprasId)
    .order('linea')

  const itemsOc = (itemsOcRaw ?? []).filter((it) => it.tipo !== 'SERVICIOS')
  if (itemsOc.length === 0) {
    // Spec: CA-06 — sin ítems elegibles (ej. OC 100% SERVICIOS), no hay nada
    // pendiente de recibir: vacuamente "100% recibida" (consistente con que
    // .every() de un array vacío ya daría true más abajo).
    return { por_item: [], oc_recibida_100: true }
  }

  const itemOcIds = itemsOc.map((it) => it.id)

  // Spec: RN-02 — join real documentos_ingreso_items.item_oc_id →
  // documentos_ingreso.estado='cerrado'. 2 pasos (líneas, luego documentos
  // cerrados) en vez de un join SQL directo — mismo patrón ya usado en todo
  // el proyecto con adminClient() (ver lib/np-cobertura.ts).
  const lineasRecepcion: { item_oc_id: string | null; cantidad: number; documento_ingreso_id: string }[] = []
  for (const lote of enLotes(itemOcIds)) {
    const { data } = await adminClient()
      .from('documentos_ingreso_items')
      .select('item_oc_id, cantidad, documento_ingreso_id')
      .in('item_oc_id', lote)
    lineasRecepcion.push(...(data ?? []))
  }

  const docIds = [...new Set(lineasRecepcion.map((l) => l.documento_ingreso_id))]
  const docsCerrados = new Set<string>()
  for (const lote of enLotes(docIds)) {
    const { data } = await adminClient()
      .from('documentos_ingreso')
      .select('id, estado')
      .in('id', lote)
      .eq('estado', 'cerrado')
    for (const d of data ?? []) docsCerrados.add(d.id)
  }

  const recibidoPorItem: Record<string, number> = {}
  for (const l of lineasRecepcion) {
    if (!l.item_oc_id) continue
    if (!docsCerrados.has(l.documento_ingreso_id)) continue
    recibidoPorItem[l.item_oc_id] = (recibidoPorItem[l.item_oc_id] ?? 0) + Number(l.cantidad)
  }

  const por_item: ItemCoberturaOC[] = itemsOc.map((it) => {
    const cantidad_comprada = Number(it.cantidad)
    const cantidad_recibida = recibidoPorItem[it.id] ?? 0
    const saldo = cantidad_comprada - cantidad_recibida
    return {
      item_oc_id: it.id,
      linea: it.linea,
      descripcion: it.descripcion,
      cantidad_comprada,
      cantidad_recibida,
      saldo: Math.max(0, saldo),
      porcentaje: cantidad_comprada > 0 ? Math.min(100, (cantidad_recibida / cantidad_comprada) * 100) : 0,
      sobre_recepcion: saldo < 0,
    }
  })

  const oc_recibida_100 = por_item.every((it) => it.saldo <= 0)

  return { por_item, oc_recibida_100 }
}
