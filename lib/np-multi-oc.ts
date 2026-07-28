import { adminClient } from '@/lib/supabase/clients'
import {
  validarEnlaceYJustificacion, verificarSobrecompra,
  type ErrorEnlace, type ItemExcedido,
} from '@/lib/np-cobertura'

// Spec: HU-016 — helpers de orquestación multi-NP para la creación (consolidar) y
// edición (PUT ordenes/[id]) de OCs que pueden enlazar ítems de varias NPs distintas.
// lib/np-cobertura.ts sigue siendo "cálculo puro por una NP a la vez" (Decisión 5,
// sdd-design.md); este módulo agrupa/itera/agrega errores, responsabilidad distinta.

export type ItemConNP = {
  item_np_id: string
  cantidad: number
  justificacion_cantidad?: string | null
  [k: string]: unknown
}

// Agrupa ítems por la NP real de su item_np_id (1 sola query a items_np). Ítems cuyo
// item_np_id no corresponde a ninguna fila real de items_np quedan fuera del mapa — el
// llamador debe comparar el total agrupado contra items.length para detectar
// item_np_id inexistentes (generaliza el guard item_no_pertenece_a_np de HU-014: ya no
// hay una única NP "dueña" del request contra la cual comparar).
export async function agruparItemsPorNP(items: ItemConNP[]): Promise<Map<string, ItemConNP[]>> {
  const itemNpIds = [...new Set(items.map(i => i.item_np_id).filter(Boolean))]
  const grupos = new Map<string, ItemConNP[]>()
  if (itemNpIds.length === 0) return grupos

  const { data: itemsNp } = await adminClient()
    .from('items_np')
    .select('id, nota_pedido_id')
    .in('id', itemNpIds)

  const npPorItem: Record<string, string> = {}
  for (const it of (itemsNp ?? [])) npPorItem[it.id] = it.nota_pedido_id

  for (const item of items) {
    const npId = npPorItem[item.item_np_id]
    if (!npId) continue
    if (!grupos.has(npId)) grupos.set(npId, [])
    grupos.get(npId)!.push(item)
  }
  return grupos
}

export type ResultadoValidacionMultiNP = {
  valido: boolean
  erroresJustificacion: { np_id: string; errores: ErrorEnlace[] }[]
  itemsExcedidos: { np_id: string; items: ItemExcedido[] }[]
}

// Corre validarEnlaceYJustificacion + verificarSobrecompra para cada grupo (NP).
// Devuelve TODOS los errores agregados por np_id, no el primero que falle — el
// frontend necesita mostrar un mensaje claro por cada NP involucrada (CA-13).
export async function validarYVerificarPorNP(
  gruposPorNP: Map<string, ItemConNP[]>,
  opts: { excluirOcId?: string; sobrecompraConfirmada?: boolean } = {}
): Promise<ResultadoValidacionMultiNP> {
  const erroresJustificacion: { np_id: string; errores: ErrorEnlace[] }[] = []
  const itemsExcedidos: { np_id: string; items: ItemExcedido[] }[] = []

  for (const [np_id, items] of gruposPorNP) {
    const validacion = await validarEnlaceYJustificacion(items, np_id)
    if (!validacion.valido) erroresJustificacion.push({ np_id, errores: validacion.errores })

    if (!opts.sobrecompraConfirmada) {
      const excedidos = await verificarSobrecompra(np_id, items, opts.excluirOcId)
      if (excedidos.length > 0) itemsExcedidos.push({ np_id, items: excedidos })
    }
  }

  return {
    valido: erroresJustificacion.length === 0 && itemsExcedidos.length === 0,
    erroresJustificacion,
    itemsExcedidos,
  }
}

// CA-13/RN-04: NPs que hay que recalcular tras una edición = unión de las NPs
// referenciadas ANTES (items_oc actuales de la OC) y DESPUÉS (itemsNuevos del PUT). Una
// NP que pierde todas sus líneas en la edición sigue en la unión y debe recalcular su
// cobertura/Estado igual que si la OC se hubiera cancelado para esa NP — no puede
// quedar "congelada" reflejando una cobertura que ya no existe.
export async function npsAfectadasPorEdicion(
  ocId: string,
  itemsNuevos: ItemConNP[]
): Promise<Set<string>> {
  const { data: itemsOcActuales } = await adminClient()
    .from('items_oc')
    .select('item_np_id')
    .eq('registro_compras_id', ocId)

  const itemNpIdsAntes = (itemsOcActuales ?? [])
    .map((i: { item_np_id: string | null }) => i.item_np_id)
    .filter((id): id is string => Boolean(id))
  const itemNpIdsDespues = itemsNuevos.map(i => i.item_np_id).filter(Boolean)

  const todosItemNpIds = [...new Set([...itemNpIdsAntes, ...itemNpIdsDespues])]
  if (todosItemNpIds.length === 0) return new Set()

  const { data: itemsNp } = await adminClient()
    .from('items_np')
    .select('id, nota_pedido_id')
    .in('id', todosItemNpIds)

  return new Set((itemsNp ?? []).map((it: { nota_pedido_id: string }) => it.nota_pedido_id))
}
