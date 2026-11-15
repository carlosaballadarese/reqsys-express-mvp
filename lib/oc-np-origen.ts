import { adminClient } from '@/lib/supabase/clients'

const LOTE = 100
function enLotes<T>(items: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += LOTE) lotes.push(items.slice(i, i + LOTE))
  return lotes
}

export type NpOrigenItem = { np_id: string; np_numero: string; np_linea: number }

// Spec: SC-015 RN-01 — item_np_id -> {np_id, np_numero, np_linea}; ausente del mapa si item_np_id es null.
export async function resolverNpOrigenPorItem(
  itemsOc: { item_np_id: string | null }[]
): Promise<Record<string, NpOrigenItem>> {
  const itemNpIds = [...new Set(itemsOc.map(i => i.item_np_id).filter((v): v is string => !!v))]
  if (itemNpIds.length === 0) return {}

  const itemsNp: { id: string; nota_pedido_id: string; linea: number }[] = []
  for (const lote of enLotes(itemNpIds)) {
    const { data } = await adminClient()
      .from('items_np').select('id, nota_pedido_id, linea').in('id', lote)
    itemsNp.push(...(data ?? []))
  }

  const npIds = [...new Set(itemsNp.map(i => i.nota_pedido_id))]
  const nps: { id: string; numero: string }[] = []
  for (const lote of enLotes(npIds)) {
    const { data } = await adminClient()
      .from('notas_pedido').select('id, numero').in('id', lote)
    nps.push(...(data ?? []))
  }
  const numeroPorNpId = new Map(nps.map(n => [n.id, n.numero]))

  const resultado: Record<string, NpOrigenItem> = {}
  for (const it of itemsNp) {
    const numero = numeroPorNpId.get(it.nota_pedido_id)
    if (numero) resultado[it.id] = { np_id: it.nota_pedido_id, np_numero: numero, np_linea: it.linea }
  }
  return resultado
}

// Spec: SC-015 — adjunta el origen resuelto a cada ítem (null si no tiene item_np_id o no se resolvió).
export function adjuntarNpOrigen<T extends { item_np_id: string | null }>(
  items: T[],
  mapa: Record<string, NpOrigenItem>
): (T & { np_id: string | null; np_numero: string | null; np_linea: number | null })[] {
  return items.map(it => {
    const origen = it.item_np_id ? mapa[it.item_np_id] : undefined
    return {
      ...it,
      np_id:     origen?.np_id ?? null,
      np_numero: origen?.np_numero ?? null,
      np_linea:  origen?.np_linea ?? null,
    }
  })
}
