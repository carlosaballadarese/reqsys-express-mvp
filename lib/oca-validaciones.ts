// Spec: HU-018 RN-03, RN-04, RN-05 — validaciones compartidas por
// POST /api/compras/ocas y PUT /api/compras/ocas/[id].

export type OcaItemInput = {
  codigo: string
  descripcion: string
  unidad: string
  categoria?: string
  precio_unitario?: number
  precio_maximo?: number
  // Spec: HU-019 CA-04 — vínculo a la línea de NP de origen (trazabilidad,
  // igual patrón que items_oc.item_np_id). Ausente/null en OCA independiente.
  item_np_id?: string | null
}

export type OcaCabeceraInput = {
  tipo?: string
  fecha_inicio?: string
  fecha_fin?: string
  presupuesto_total?: number
  items?: OcaItemInput[]
}

// Spec: HU-018 RN-05 — extraída para que HU-020 (modificación de lista de
// precios vía enmienda) la reutilice sin duplicar la regla de negocio.
export function validarItemsSegunTipo(tipo: string | undefined, items: OcaItemInput[]): string | null {
  for (const item of items) {
    if (tipo === 'precio_fijo' && (item.precio_unitario === undefined || item.precio_unitario === null)) {
      return `El ítem ${item.codigo} requiere precio_unitario (tipo precio_fijo)`
    }
    if (tipo === 'precio_variable_tope' && (item.precio_maximo === undefined || item.precio_maximo === null)) {
      return `El ítem ${item.codigo} requiere precio_maximo (tipo precio_variable_tope)`
    }
  }
  return null
}

export function validarCabeceraEItems(body: OcaCabeceraInput): string | null {
  if (!['precio_fijo', 'precio_variable_tope'].includes(body.tipo ?? '')) {
    return 'Tipo de OCA inválido'
  }
  if (!body.fecha_inicio || !body.fecha_fin || new Date(body.fecha_fin) <= new Date(body.fecha_inicio)) {
    return 'La fecha de fin debe ser posterior a la fecha de inicio'
  }
  if (!body.presupuesto_total || body.presupuesto_total <= 0) {
    return 'El presupuesto total debe ser un monto positivo'
  }
  return validarItemsSegunTipo(body.tipo, body.items ?? [])
}
