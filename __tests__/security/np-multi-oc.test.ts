// Spec: HU-016-v3.md — helpers de orquestación multi-NP (lib/np-multi-oc.ts).

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))
jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

describe('agruparItemsPorNP / npsAfectadasPorEdicion', () => {
  beforeEach(() => jest.resetModules())

  it('agrupa ítems por la NP real de su item_np_id', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'items_np') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [
                { id: 'item-a1', nota_pedido_id: 'np-a' },
                { id: 'item-b1', nota_pedido_id: 'np-b' },
              ],
              error: null,
            }),
          }),
        }
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { agruparItemsPorNP } = require('@/lib/np-multi-oc')
    const grupos = await agruparItemsPorNP([
      { item_np_id: 'item-a1', cantidad: 2 },
      { item_np_id: 'item-b1', cantidad: 3 },
    ])
    expect(grupos.get('np-a')).toHaveLength(1)
    expect(grupos.get('np-b')).toHaveLength(1)
    expect(grupos.size).toBe(2)
  })

  it('excluye del mapa ítems cuyo item_np_id no corresponde a ninguna fila real', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'items_np') {
        return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'item-a1', nota_pedido_id: 'np-a' }], error: null }) }) }
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { agruparItemsPorNP } = require('@/lib/np-multi-oc')
    const grupos = await agruparItemsPorNP([
      { item_np_id: 'item-a1', cantidad: 2 },
      { item_np_id: 'item-fantasma', cantidad: 1 },
    ])
    const totalAgrupado = [...grupos.values()].reduce((s, arr) => s + arr.length, 0)
    expect(totalAgrupado).toBe(1) // el ítem fantasma queda fuera — el llamador debe detectarlo
  })

  it('npsAfectadasPorEdicion: unión de NPs antes (items_oc actuales) y después (itemsNuevos)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'items_oc') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ item_np_id: 'item-a1' }], error: null }) }) }
      }
      if (table === 'items_np') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [
                { id: 'item-a1', nota_pedido_id: 'np-a' },
                { id: 'item-c1', nota_pedido_id: 'np-c' },
              ],
              error: null,
            }),
          }),
        }
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { npsAfectadasPorEdicion } = require('@/lib/np-multi-oc')
    // antes: solo NP-A (item-a1). después: solo NP-C (item-c1, reemplazó a NP-A por completo).
    const nps = await npsAfectadasPorEdicion('oc-1', [{ item_np_id: 'item-c1', cantidad: 1 }])
    expect(nps.has('np-a')).toBe(true) // NP-A perdió todas sus líneas — igual debe recalcularse (RN-04)
    expect(nps.has('np-c')).toBe(true)
    expect(nps.size).toBe(2)
  })
})

describe('validarYVerificarPorNP — agrega errores por NP, no falla en el primero', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.doMock('@/lib/np-cobertura', () => ({
      validarEnlaceYJustificacion: jest.fn((items: { item_np_id: string }[], np_id: string) => {
        if (np_id === 'np-sin-justificacion') {
          return Promise.resolve({ valido: false, errores: [{ linea_oc: 1, item_np_id: items[0].item_np_id, motivo: 'justificacion_requerida', cantidad_oc: 9, cantidad_np: 5 }] })
        }
        return Promise.resolve({ valido: true, errores: [] })
      }),
      verificarSobrecompra: jest.fn((np_id: string) => {
        if (np_id === 'np-excedida') {
          return Promise.resolve([{ item_np_id: 'item-x', linea: 1, descripcion: 'X', solicitado: 5, comprometido: 5, saldo: 0, nuevo: 3, exceso: 3 }])
        }
        return Promise.resolve([])
      }),
    }))
  })

  it('devuelve errores agrupados por np_id para 2 NPs distintas con problemas distintos', async () => {
    const { validarYVerificarPorNP } = require('@/lib/np-multi-oc')
    const grupos = new Map([
      ['np-sin-justificacion', [{ item_np_id: 'item-1', cantidad: 9 }]],
      ['np-excedida', [{ item_np_id: 'item-x', cantidad: 3 }]],
      ['np-ok', [{ item_np_id: 'item-2', cantidad: 1 }]],
    ])
    const resultado = await validarYVerificarPorNP(grupos)
    expect(resultado.valido).toBe(false)
    expect(resultado.erroresJustificacion).toHaveLength(1)
    expect(resultado.erroresJustificacion[0].np_id).toBe('np-sin-justificacion')
    expect(resultado.itemsExcedidos).toHaveLength(1)
    expect(resultado.itemsExcedidos[0].np_id).toBe('np-excedida')
  })

  it('sobrecompraConfirmada=true omite verificarSobrecompra pero sigue validando justificación', async () => {
    const { validarYVerificarPorNP } = require('@/lib/np-multi-oc')
    const grupos = new Map([['np-excedida', [{ item_np_id: 'item-x', cantidad: 3 }]]])
    const resultado = await validarYVerificarPorNP(grupos, { sobrecompraConfirmada: true })
    expect(resultado.itemsExcedidos).toHaveLength(0)
    expect(resultado.valido).toBe(true)
  })

  it('valido=true cuando ninguna NP tiene errores', async () => {
    const { validarYVerificarPorNP } = require('@/lib/np-multi-oc')
    const grupos = new Map([['np-ok', [{ item_np_id: 'item-2', cantidad: 1 }]]])
    const resultado = await validarYVerificarPorNP(grupos)
    expect(resultado.valido).toBe(true)
    expect(resultado.erroresJustificacion).toHaveLength(0)
    expect(resultado.itemsExcedidos).toHaveLength(0)
  })
})
