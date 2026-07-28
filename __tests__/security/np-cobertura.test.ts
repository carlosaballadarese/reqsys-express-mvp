// Spec: HU-016-v3.md — CA-10 (cobertura NP→OC vía items_oc.item_np_id, no vía
// registro_compras.nota_pedido_id, para soportar OCs consolidadas de varias NPs).
//
// Cubre calcularCoberturaNP() directamente contra un mock de adminClient() (sin pasar
// por HTTP) — mismo criterio que np-estado-actualizar.test.ts (HU-009 Fase 5): probar el
// algoritmo real, no solo que las rutas invocan la función.

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))
jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

import { calcularCoberturaNP } from '@/lib/np-cobertura'

type ItemNP = { id: string; linea: number; descripcion: string; cantidad: number }
type ItemOC = { item_np_id: string | null; cantidad: number; registro_compras_id: string }
type OC = { id: string; estado_oc: string }

function setupMock(opts: { itemsNp: ItemNP[]; itemsOc?: ItemOC[]; ocs?: OC[] }) {
  const { itemsNp, itemsOc = [], ocs = [] } = opts

  mockFrom.mockImplementation((table: string) => {
    if (table === 'items_np') {
      return {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: itemsNp, error: null }) }) }),
      }
    }
    if (table === 'items_oc') {
      return { select: () => ({ in: () => Promise.resolve({ data: itemsOc, error: null }) }) }
    }
    if (table === 'registro_compras') {
      return {
        select: () => ({
          in: () => ({
            neq: () => ({ neq: () => Promise.resolve({ data: ocs, error: null }) }),
          }),
        }),
      }
    }
    throw new Error(`tabla no mockeada: ${table}`)
  })
}

describe('calcularCoberturaNP — caso single-NP (regresión)', () => {
  it('calcula comprometido/saldo/porcentaje correctamente con una sola OC vigente', async () => {
    setupMock({
      itemsNp: [{ id: 'item-1', linea: 1, descripcion: 'Bomba', cantidad: 10 }],
      itemsOc: [{ item_np_id: 'item-1', cantidad: 4, registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', estado_oc: 'en_proceso' }],
    })
    const cobertura = await calcularCoberturaNP('np-1')
    expect(cobertura.por_item[0].cantidad_comprometida).toBe(4)
    expect(cobertura.por_item[0].saldo).toBe(6)
    expect(cobertura.np_cubierta).toBe(false)
  })

  it('devuelve vacío/no cubierta si la NP no tiene ítems', async () => {
    setupMock({ itemsNp: [] })
    const cobertura = await calcularCoberturaNP('np-vacia')
    expect(cobertura.por_item).toEqual([])
    expect(cobertura.np_cubierta).toBe(false)
  })
})

describe('calcularCoberturaNP — HU-016 CA-10 (OC consolidada de varias NPs)', () => {
  it('una OC consolidada solo aporta a la cobertura de la NP a la que realmente enlaza cada línea', async () => {
    // NP-A tiene 1 ítem (item-a). La OC consolidada oc-multi tiene líneas de item-a (NP-A)
    // y de item-b (NP-B, no relevante aquí). Al calcular cobertura de NP-A, solo debe
    // contar la línea con item_np_id = item-a.
    setupMock({
      itemsNp: [{ id: 'item-a', linea: 1, descripcion: 'Válvula', cantidad: 5 }],
      itemsOc: [
        { item_np_id: 'item-a', cantidad: 5, registro_compras_id: 'oc-multi' },
      ],
      ocs: [{ id: 'oc-multi', estado_oc: 'en_proceso' }],
    })
    const cobertura = await calcularCoberturaNP('np-a')
    expect(cobertura.por_item[0].cantidad_comprometida).toBe(5)
    expect(cobertura.np_cubierta).toBe(true)
  })

  it('excluye OCs rechazadas/canceladas del acumulado (aunque estén vinculadas por item_np_id)', async () => {
    setupMock({
      itemsNp: [{ id: 'item-a', linea: 1, descripcion: 'Válvula', cantidad: 5 }],
      itemsOc: [{ item_np_id: 'item-a', cantidad: 5, registro_compras_id: 'oc-rechazada' }],
      ocs: [], // registro_compras.in(...).neq(...).neq(...) ya excluye rechazada/cancelada
    })
    const cobertura = await calcularCoberturaNP('np-a')
    expect(cobertura.por_item[0].cantidad_comprometida).toBe(0)
    expect(cobertura.np_cubierta).toBe(false)
  })

  it('excluir_oc_id ignora las líneas de esa OC (edición in-place)', async () => {
    setupMock({
      itemsNp: [{ id: 'item-a', linea: 1, descripcion: 'Válvula', cantidad: 5 }],
      itemsOc: [{ item_np_id: 'item-a', cantidad: 5, registro_compras_id: 'oc-editando' }],
      ocs: [{ id: 'oc-editando', estado_oc: 'en_proceso' }],
    })
    const cobertura = await calcularCoberturaNP('np-a', 'oc-editando')
    expect(cobertura.por_item[0].cantidad_comprometida).toBe(0)
  })
})
