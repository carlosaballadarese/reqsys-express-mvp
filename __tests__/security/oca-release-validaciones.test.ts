// Spec: HU-021-v2.md — RN-05, CA-01, CA-03

import { validarGenerarRelease, type OcaItemCatalogo } from '@/lib/oca-release-validaciones'

const catalogoFijo: OcaItemCatalogo[] = [
  { id: 'item-1', codigo: 'FER-001', descripcion: 'Tornillos', unidad: 'caja', precio_unitario: 10, precio_maximo: null },
  { id: 'item-2', codigo: 'FER-002', descripcion: 'Clavos', unidad: 'caja', precio_unitario: 5, precio_maximo: null },
]
const catalogoVariable: OcaItemCatalogo[] = [
  { id: 'item-1', codigo: 'COMB-001', descripcion: 'Diésel', unidad: 'galón', precio_unitario: null, precio_maximo: 3.5 },
]

describe('validarGenerarRelease — casos comunes', () => {
  it('rechaza lista de ítems vacía', () => {
    const r = validarGenerarRelease('precio_fijo', [], catalogoFijo)
    expect(r).toEqual({ error: 'Debe incluir al menos un ítem' })
  })

  it('rechaza cantidad <= 0', () => {
    const r = validarGenerarRelease('precio_fijo', [{ oca_item_id: 'item-1', cantidad: 0 }], catalogoFijo)
    expect('error' in r).toBe(true)
  })

  it('rechaza un oca_item_id que no pertenece al catálogo de la OCA', () => {
    const r = validarGenerarRelease('precio_fijo', [{ oca_item_id: 'item-inexistente', cantidad: 1 }], catalogoFijo)
    expect('error' in r).toBe(true)
  })
})

describe('validarGenerarRelease — precio_fijo (RN-05)', () => {
  it('toma el precio del catálogo e ignora cualquier precio_unitario del input', () => {
    const r = validarGenerarRelease('precio_fijo', [{ oca_item_id: 'item-1', cantidad: 3, precio_unitario: 999 }], catalogoFijo)
    expect('error' in r).toBe(false)
    if (!('error' in r)) {
      expect(r.itemsValidados[0].precio_unitario_final).toBe(10)
      expect(r.itemsValidados[0].subtotal).toBe(30)
      expect(r.monto_total).toBe(30)
    }
  })

  it('rechaza si el ítem del catálogo no tiene precio_unitario definido', () => {
    const catalogoIncompleto: OcaItemCatalogo[] = [
      { id: 'item-1', codigo: 'X', descripcion: 'X', unidad: 'EA', precio_unitario: null, precio_maximo: null },
    ]
    const r = validarGenerarRelease('precio_fijo', [{ oca_item_id: 'item-1', cantidad: 1 }], catalogoIncompleto)
    expect('error' in r).toBe(true)
  })

  it('calcula monto_total correctamente con múltiples ítems', () => {
    const r = validarGenerarRelease('precio_fijo', [
      { oca_item_id: 'item-1', cantidad: 2 },
      { oca_item_id: 'item-2', cantidad: 4 },
    ], catalogoFijo)
    expect('error' in r).toBe(false)
    if (!('error' in r)) {
      expect(r.monto_total).toBe(2 * 10 + 4 * 5)
    }
  })
})

describe('validarGenerarRelease — precio_variable_tope (RN-05)', () => {
  it('rechaza sin precio_unitario en el input', () => {
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 10 }], catalogoVariable)
    expect('error' in r).toBe(true)
  })

  it('rechaza precio_unitario <= 0', () => {
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 10, precio_unitario: 0 }], catalogoVariable)
    expect('error' in r).toBe(true)
  })

  it('rechaza si el ítem del catálogo no tiene precio_maximo definido', () => {
    const catalogoIncompleto: OcaItemCatalogo[] = [
      { id: 'item-1', codigo: 'X', descripcion: 'X', unidad: 'EA', precio_unitario: null, precio_maximo: null },
    ]
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 1, precio_unitario: 5 }], catalogoIncompleto)
    expect('error' in r).toBe(true)
  })

  it('rechaza precio_unitario que supera el precio_maximo', () => {
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 10, precio_unitario: 4 }], catalogoVariable)
    expect('error' in r).toBe(true)
  })

  it('acepta precio_unitario igual al precio_maximo (límite)', () => {
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 10, precio_unitario: 3.5 }], catalogoVariable)
    expect('error' in r).toBe(false)
    if (!('error' in r)) {
      expect(r.itemsValidados[0].precio_unitario_final).toBe(3.5)
      expect(r.monto_total).toBe(35)
    }
  })

  it('acepta precio_unitario menor al precio_maximo', () => {
    const r = validarGenerarRelease('precio_variable_tope', [{ oca_item_id: 'item-1', cantidad: 2, precio_unitario: 3 }], catalogoVariable)
    expect('error' in r).toBe(false)
    if (!('error' in r)) {
      expect(r.monto_total).toBe(6)
    }
  })
})
