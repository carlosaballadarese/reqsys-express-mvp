// Spec: HU-021 RN-05 — validación de ítems/precio al generar un release, y
// cálculo de monto_total (CA-03). RN-03 (oca.estado='vigente') y RN-06 (área
// habilitada) se validan en el propio endpoint — requieren contexto de BD
// que esta función no tiene.

export type ReleaseItemInput = {
  oca_item_id: string
  cantidad: number
  precio_unitario?: number
}

export type OcaItemCatalogo = {
  id: string
  codigo: string
  descripcion: string
  unidad: string
  precio_unitario: number | null
  precio_maximo: number | null
}

export type ItemValidado = {
  oca_item_id: string
  codigo: string
  descripcion: string
  unidad: string
  precio_unitario_final: number
  cantidad: number
  subtotal: number
}

type ResultadoValidacion =
  | { error: string }
  | { itemsValidados: ItemValidado[]; monto_total: number }

export function validarGenerarRelease(
  ocaTipo: 'precio_fijo' | 'precio_variable_tope',
  items: ReleaseItemInput[],
  catalogo: OcaItemCatalogo[]
): ResultadoValidacion {
  if (!items || items.length === 0) {
    return { error: 'Debe incluir al menos un ítem' }
  }

  const itemsValidados: ItemValidado[] = []
  let monto_total = 0

  for (const item of items) {
    if (!item.cantidad || item.cantidad <= 0) {
      return { error: `La cantidad del ítem ${item.oca_item_id} debe ser un valor positivo` }
    }

    const catalogoItem = catalogo.find(c => c.id === item.oca_item_id)
    if (!catalogoItem) {
      return { error: `El ítem ${item.oca_item_id} no pertenece a la lista de precios de la OCA` }
    }

    let precioFinal: number
    if (ocaTipo === 'precio_fijo') {
      // Spec: RN-05 — el precio se toma automáticamente de la lista de
      // precios; cualquier precio_unitario que venga en el input se ignora.
      if (catalogoItem.precio_unitario === null || catalogoItem.precio_unitario === undefined) {
        return { error: `El ítem ${catalogoItem.codigo} no tiene precio_unitario definido` }
      }
      precioFinal = catalogoItem.precio_unitario
    } else {
      if (item.precio_unitario === undefined || item.precio_unitario === null || item.precio_unitario <= 0) {
        return { error: `El ítem ${catalogoItem.codigo} requiere un precio real mayor a 0` }
      }
      if (catalogoItem.precio_maximo === null || catalogoItem.precio_maximo === undefined) {
        return { error: `El ítem ${catalogoItem.codigo} no tiene precio_maximo definido` }
      }
      if (item.precio_unitario > catalogoItem.precio_maximo) {
        return { error: `El precio ingresado para ${catalogoItem.codigo} supera el precio máximo (${catalogoItem.precio_maximo})` }
      }
      precioFinal = item.precio_unitario
    }

    const subtotal = Math.round(precioFinal * item.cantidad * 100) / 100
    monto_total += subtotal

    itemsValidados.push({
      oca_item_id: item.oca_item_id,
      codigo: catalogoItem.codigo,
      descripcion: catalogoItem.descripcion,
      unidad: catalogoItem.unidad,
      precio_unitario_final: precioFinal,
      cantidad: item.cantidad,
      subtotal,
    })
  }

  return { itemsValidados, monto_total: Math.round(monto_total * 100) / 100 }
}
