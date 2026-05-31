import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

export type ItemCobertura = {
  item_np_id:            string
  linea:                 number
  descripcion:           string
  cantidad_solicitada:   number
  cantidad_comprometida: number
  saldo:                 number
  porcentaje:            number
}

export type CoberturaResult = {
  por_item:          ItemCobertura[]
  np_cubierta:       boolean
  porcentaje_global: number
}

export type ItemExcedido = {
  item_np_id:  string
  linea:       number
  descripcion: string
  solicitado:  number
  comprometido: number
  saldo:       number
  nuevo:       number
  exceso:      number
}

// Calcula la cobertura de cantidades NP→OC para cada ítem.
// excluir_oc_id: en edición de OC, excluye sus ítems actuales del acumulado
// para no contar doble antes del replace.
export async function calcularCoberturaNP(
  np_id: string,
  excluir_oc_id?: string
): Promise<CoberturaResult> {
  const { data: npItems } = await adminClient()
    .from('items_np')
    .select('id, linea, descripcion, cantidad')
    .eq('nota_pedido_id', np_id)
    .order('linea')

  if (!npItems || npItems.length === 0) {
    return { por_item: [], np_cubierta: false, porcentaje_global: 0 }
  }

  // OCs válidas para esta NP (excluye rechazadas y canceladas)
  let ocQuery = adminClient()
    .from('registro_compras')
    .select('id')
    .eq('nota_pedido_id', np_id)
    .neq('estado_oc', 'rechazada')
    .neq('estado_oc', 'cancelada')

  if (excluir_oc_id) {
    ocQuery = ocQuery.neq('id', excluir_oc_id)
  }

  const { data: ocsValidas } = await ocQuery
  const ocIds = (ocsValidas ?? []).map((oc: { id: string }) => oc.id)

  const comprometidoMap: Record<string, number> = {}
  if (ocIds.length > 0) {
    const { data: itemsOC } = await adminClient()
      .from('items_oc')
      .select('item_np_id, cantidad')
      .in('registro_compras_id', ocIds)

    for (const it of (itemsOC ?? [])) {
      if (!it.item_np_id) continue
      comprometidoMap[it.item_np_id] =
        (comprometidoMap[it.item_np_id] ?? 0) + Number(it.cantidad)
    }
  }

  const por_item: ItemCobertura[] = npItems.map((item: any) => {
    const comprometido = comprometidoMap[item.id] ?? 0
    const solicitado   = Number(item.cantidad)
    const saldo        = Math.max(0, solicitado - comprometido)
    const porcentaje   = solicitado > 0 ? (comprometido / solicitado) * 100 : 0
    return {
      item_np_id:            item.id,
      linea:                 item.linea,
      descripcion:           item.descripcion,
      cantidad_solicitada:   solicitado,
      cantidad_comprometida: comprometido,
      saldo,
      porcentaje,
    }
  })

  const np_cubierta        = por_item.length > 0 && por_item.every(i => i.porcentaje >= 100)
  const total_solicitado   = por_item.reduce((s, i) => s + i.cantidad_solicitada, 0)
  const total_comprometido = por_item.reduce((s, i) => s + i.cantidad_comprometida, 0)
  const porcentaje_global  = total_solicitado > 0
    ? (total_comprometido / total_solicitado) * 100
    : 0

  return { por_item, np_cubierta, porcentaje_global }
}

// Verifica si los nuevos ítems excederían el saldo disponible en la NP.
// Devuelve la lista de ítems excedidos (vacía = sin sobrecompra).
export async function verificarSobrecompra(
  np_id: string,
  nuevosItems: { item_np_id: string | null; cantidad: number }[],
  excluir_oc_id?: string
): Promise<ItemExcedido[]> {
  const cobertura = await calcularCoberturaNP(np_id, excluir_oc_id)

  const nuevoCantMap: Record<string, number> = {}
  for (const item of nuevosItems) {
    if (!item.item_np_id) continue
    nuevoCantMap[item.item_np_id] =
      (nuevoCantMap[item.item_np_id] ?? 0) + Number(item.cantidad)
  }

  const excedidos: ItemExcedido[] = []
  for (const [item_np_id, nuevaCant] of Object.entries(nuevoCantMap)) {
    const cob = cobertura.por_item.find(i => i.item_np_id === item_np_id)
    if (!cob) continue
    if (nuevaCant > cob.saldo) {
      excedidos.push({
        item_np_id,
        linea:        cob.linea,
        descripcion:  cob.descripcion,
        solicitado:   cob.cantidad_solicitada,
        comprometido: cob.cantidad_comprometida,
        saldo:        cob.saldo,
        nuevo:        nuevaCant,
        exceso:       nuevaCant - cob.saldo,
      })
    }
  }

  return excedidos
}

// Completa automáticamente una NP cuando su cobertura alcanza el 100%.
// Solo actúa si la NP está en estado 'aprobada'.
export async function autoCompletarNP(np_id: string, np_estado: string): Promise<void> {
  if (np_estado !== 'aprobada') return

  const { np_cubierta } = await calcularCoberturaNP(np_id)
  if (!np_cubierta) return

  await adminClient()
    .from('notas_pedido')
    .update({ estado: 'completada' })
    .eq('id', np_id)

  await adminClient().from('historial_np').insert({
    np_id,
    estado:       'completada',
    actor_nombre: 'Sistema',
    actor_email:  'sistema@reqsys',
    notas:        'NP completada automáticamente por cobertura al 100%',
  })

  await registrarAuditoria({
    accion:     'completar_np',
    entidad:    'nota_pedido',
    entidad_id: np_id,
    referencia: np_id,
    detalle:    { automatico: true, motivo: 'cobertura_100' },
  })
}
