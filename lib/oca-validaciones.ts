// Spec: HU-018 RN-03, RN-04, RN-05 — validaciones compartidas por
// POST /api/compras/ocas y PUT /api/compras/ocas/[id].

export type OcaItemInput = {
  codigo: string
  descripcion: string
  unidad: string
  categoria?: string
  precio_unitario?: number
  precio_maximo?: number
}

export type OcaCabeceraInput = {
  tipo?: string
  fecha_inicio?: string
  fecha_fin?: string
  presupuesto_total?: number
  items?: OcaItemInput[]
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
  for (const item of body.items ?? []) {
    if (body.tipo === 'precio_fijo' && (item.precio_unitario === undefined || item.precio_unitario === null)) {
      return `El ítem ${item.codigo} requiere precio_unitario (tipo precio_fijo)`
    }
    if (body.tipo === 'precio_variable_tope' && (item.precio_maximo === undefined || item.precio_maximo === null)) {
      return `El ítem ${item.codigo} requiere precio_maximo (tipo precio_variable_tope)`
    }
  }
  return null
}
