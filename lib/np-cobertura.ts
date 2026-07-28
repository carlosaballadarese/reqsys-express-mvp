import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

// HU-003: Trazabilidad ítem OC → ítem NP
export type ErrorEnlace = {
  linea_oc:    number   // 1-based
  item_np_id:  string
  motivo:      'justificacion_requerida'
  cantidad_oc: number
  cantidad_np: number
}

export type ResultadoValidacionEnlace = {
  valido:  boolean
  errores: ErrorEnlace[]
}

// Valida que cada ítem con item_np_id tenga justificación cuando la cantidad difiere.
// Solo evalúa ítems que ya tienen item_np_id asignado; el guard previo se encarga de los nulos.
export async function validarEnlaceYJustificacion(
  items: {
    item_np_id:              string | null
    cantidad:                number
    justificacion_cantidad?: string | null
  }[],
  np_id: string
): Promise<ResultadoValidacionEnlace> {
  const itemNpIds = [...new Set(
    items.map(i => i.item_np_id).filter(Boolean) as string[]
  )]

  if (itemNpIds.length === 0) return { valido: true, errores: [] }

  const { data: npItems } = await adminClient()
    .from('items_np')
    .select('id, cantidad')
    .in('id', itemNpIds)
    .eq('nota_pedido_id', np_id)

  const cantidadMap: Record<string, number> = {}
  for (const it of (npItems ?? [])) cantidadMap[it.id] = Number(it.cantidad)

  const errores: ErrorEnlace[] = []
  items.forEach((item, index) => {
    if (!item.item_np_id) return
    const cantNP = cantidadMap[item.item_np_id]
    if (cantNP === undefined) return
    if (item.cantidad !== cantNP && !item.justificacion_cantidad?.trim()) {
      errores.push({
        linea_oc:    index + 1,
        item_np_id:  item.item_np_id,
        motivo:      'justificacion_requerida',
        cantidad_oc: item.cantidad,
        cantidad_np: cantNP,
      })
    }
  })

  return { valido: errores.length === 0, errores }
}

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
//
// Spec: HU-016 CA-10 — el acumulado comprometido se calcula por
// items_oc.item_np_id → items_np.nota_pedido_id, NO por registro_compras.nota_pedido_id
// (que queda NULL en OCs consolidadas, Decisión 1 de sdd-design.md). Una OC consolidada
// aporta a la cobertura de cada NP solo por sus líneas que realmente enlazan a esa NP.
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

  const npItemIds = npItems.map((item: { id: string }) => item.id)

  // Todas las líneas de OC (de cualquier OC, single-NP o consolidada) que enlazan
  // a algún ítem de esta NP.
  const { data: itemsOCTodos } = await adminClient()
    .from('items_oc')
    .select('item_np_id, cantidad, registro_compras_id')
    .in('item_np_id', npItemIds)

  const ocIdsCandidatos = [...new Set(
    (itemsOCTodos ?? []).map((it: { registro_compras_id: string }) => it.registro_compras_id)
  )].filter(ocId => ocId !== excluir_oc_id)

  // De esas OCs candidatas, cuáles siguen vigentes (excluye rechazadas y canceladas)
  const comprometidoMap: Record<string, number> = {}
  if (ocIdsCandidatos.length > 0) {
    const { data: ocsValidas } = await adminClient()
      .from('registro_compras')
      .select('id')
      .in('id', ocIdsCandidatos)
      .neq('estado_oc', 'rechazada')
      .neq('estado_oc', 'cancelada')

    const ocIdsValidos = new Set((ocsValidas ?? []).map((oc: { id: string }) => oc.id))

    for (const it of (itemsOCTodos ?? [])) {
      if (!it.item_np_id) continue
      if (it.registro_compras_id === excluir_oc_id) continue
      if (!ocIdsValidos.has(it.registro_compras_id)) continue
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

  // Spec CA-05: limpiar flag de completado manual cuando el sistema auto-completa
  await adminClient()
    .from('notas_pedido')
    .update({ estado: 'completada', completado_manualmente: false })
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
