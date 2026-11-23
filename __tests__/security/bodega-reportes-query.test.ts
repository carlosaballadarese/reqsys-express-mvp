// Spec: HU-035-v2.md — CA-01 a CA-04

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import {
  ROLES_REPORTES_BODEGA,
  parsearFiltrosReporte,
  obtenerMovimientosKardex,
  obtenerExistenciasValorizadas,
  obtenerSinRotacion,
} from '@/lib/bodega-reportes-query'

function mockChain(data: unknown) {
  const resolved = { data, error: null }
  const chain: any = {}
  const noop = jest.fn(() => chain)
  chain.select = noop
  chain.order = noop
  chain.eq = noop
  chain.gte = noop
  chain.lte = noop
  chain.in = noop
  chain.range = noop
  chain.then = (resolve: any, reject: any) => Promise.resolve(resolved).then(resolve, reject)
  return chain
}

describe('ROLES_REPORTES_BODEGA', () => {
  it('incluye bodega/compras/admin/gerencia/consulta, excluye asistente_compras (HU-035 CA-05)', () => {
    expect(ROLES_REPORTES_BODEGA.sort()).toEqual(['admin', 'bodega', 'compras', 'consulta', 'gerencia'].sort())
    expect(ROLES_REPORTES_BODEGA).not.toContain('asistente_compras')
  })
})

describe('parsearFiltrosReporte', () => {
  it('parsea meses como número; null si no viene', () => {
    expect(parsearFiltrosReporte(new URLSearchParams('meses=6')).meses).toBe(6)
    expect(parsearFiltrosReporte(new URLSearchParams('')).meses).toBeNull()
  })
})

describe('obtenerMovimientosKardex (CA-01/CA-03)', () => {
  it('enriquece cada movimiento con código/descripción del producto y nombre de bodega', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'kardex_movimientos') return mockChain([
        { id: 'k1', producto_id: 'p1', bodega_id: 'b1', direccion: 'entrada', tipo: 'compra', cantidad: 10, costo_unitario: 5, saldo_resultante: 10, costo_promedio_resultante: 5, fecha: '2026-01-01' },
      ])
      if (table === 'inventario') return mockChain([{ id: 'p1', codigo: 'AL-I0001', descripcion: 'Válvula' }])
      if (table === 'bodegas') return mockChain([{ id: 'b1', nombre: 'Bodega Central' }])
      return mockChain([])
    })
    const filas = await obtenerMovimientosKardex({})
    expect(filas).toEqual([
      expect.objectContaining({ producto_codigo: 'AL-I0001', producto_descripcion: 'Válvula', bodega_nombre: 'Bodega Central' }),
    ])
  })
})

describe('obtenerExistenciasValorizadas (CA-02)', () => {
  it('calcula valor_total = saldo × costo_unitario, enriquece bodega/categoría', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'inventario') return mockChain([{ id: 'p1', codigo: 'AL-I0001', descripcion: 'Válvula', bodega_id: 'b1', categoria_id: 'c1', saldo_existencias: 10, costo_unitario: 5 }])
      if (table === 'bodegas') return mockChain([{ id: 'b1', nombre: 'Bodega Central' }])
      if (table === 'categorias') return mockChain([{ id: 'c1', nombre: 'Válvulas' }])
      return mockChain([])
    })
    const filas = await obtenerExistenciasValorizadas({})
    expect(filas).toEqual([
      expect.objectContaining({ codigo: 'AL-I0001', bodega_nombre: 'Bodega Central', categoria_nombre: 'Válvulas', saldo_existencias: 10, costo_unitario: 5, valor_total: 50 }),
    ])
  })

  it('CA-02: filtro por área técnica resuelve vía categorías cruzadas (area_categoria_bodega)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'area_categoria_bodega') return mockChain([{ categoria_id: 'c1' }])
      if (table === 'inventario') return mockChain([{ id: 'p1', codigo: 'AL-I0001', descripcion: 'Válvula', bodega_id: null, categoria_id: 'c1', saldo_existencias: 10, costo_unitario: 5 }])
      return mockChain([])
    })
    const filas = await obtenerExistenciasValorizadas({ area_id: 'area-1' })
    expect(filas).toHaveLength(1)
  })
})

describe('obtenerSinRotacion (CA-04)', () => {
  it('excluye productos con movimiento dentro de los últimos N meses, incluye los sin movimiento', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'kardex_movimientos') return mockChain([{ producto_id: 'p1', fecha: new Date().toISOString().slice(0, 10) }])
      if (table === 'inventario') return mockChain([
        { id: 'p1', codigo: 'AL-I0001', descripcion: 'Con movimiento reciente', bodega_id: null, saldo_existencias: 5 },
        { id: 'p2', codigo: 'AL-I0002', descripcion: 'Sin rotación', bodega_id: null, saldo_existencias: 20 },
      ])
      return mockChain([])
    })
    const filas = await obtenerSinRotacion({ meses: 6 })
    expect(filas.map((f) => f.codigo)).toEqual(['AL-I0002'])
  })

  it('default de 6 meses cuando no se especifica', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'kardex_movimientos') return mockChain([])
      if (table === 'inventario') return mockChain([{ id: 'p1', codigo: 'AL-I0001', descripcion: 'X', bodega_id: null, saldo_existencias: 1 }])
      return mockChain([])
    })
    const filas = await obtenerSinRotacion({})
    expect(filas).toHaveLength(1)
  })
})
