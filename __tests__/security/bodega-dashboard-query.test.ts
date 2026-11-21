// Spec: HU-038-v2.md — CA-01 a CA-04, RN-05

const mockObtenerExistenciasValorizadas = jest.fn()
jest.mock('@/lib/bodega-reportes-query', () => ({
  obtenerExistenciasValorizadas: (...args: unknown[]) => mockObtenerExistenciasValorizadas(...args),
}))

import { obtenerResumenDashboardBodega } from '@/lib/bodega-dashboard-query'

type Fila = {
  id: string; codigo: string; descripcion: string
  bodega_nombre: string | null; categoria_nombre: string | null
  saldo_existencias: number; costo_unitario: number; valor_total: number
  stock_minimo: number | null; stock_maximo: number | null; ultimo_conteo_fecha: string | null
}

function fila(overrides: Partial<Fila>): Fila {
  return {
    id: 'p-1', codigo: 'AL-I0001', descripcion: 'Producto', bodega_nombre: 'Bodega Central',
    categoria_nombre: 'Cables', saldo_existencias: 10, costo_unitario: 5, valor_total: 50,
    stock_minimo: null, stock_maximo: null, ultimo_conteo_fecha: null,
    ...overrides,
  }
}

const hace2Anios = new Date()
hace2Anios.setFullYear(hace2Anios.getFullYear() - 2)
const hace2AniosISO = hace2Anios.toISOString().slice(0, 10)

describe('obtenerResumenDashboardBodega (CA-01 a CA-04, RN-05)', () => {
  beforeEach(() => mockObtenerExistenciasValorizadas.mockReset())

  it('CA-01: agrega total_productos y valor_total_inventario sobre todas las filas', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', valor_total: 50 }),
      fila({ id: 'p-2', valor_total: 30 }),
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.kpis.total_productos).toBe(2)
    expect(r.kpis.valor_total_inventario).toBe(80)
  })

  it('CA-01: productos_con_alerta_stock cuenta bajo mínimo y sobre máximo', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', saldo_existencias: 2, stock_minimo: 10 }), // bajo mínimo
      fila({ id: 'p-2', saldo_existencias: 500, stock_maximo: 100 }), // sobre máximo
      fila({ id: 'p-3', saldo_existencias: 50, stock_minimo: 10, stock_maximo: 100 }), // sin alerta
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.kpis.productos_con_alerta_stock).toBe(2)
  })

  it('RN-05: productos_con_alerta_conteo cuenta solo el semáforo rojo (>1 año)', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', ultimo_conteo_fecha: null }), // sin_conteo — NO cuenta (RN-05)
      fila({ id: 'p-2', ultimo_conteo_fecha: hace2AniosISO }), // rojo — SÍ cuenta
      fila({ id: 'p-3', ultimo_conteo_fecha: new Date().toISOString().slice(0, 10) }), // verde — no cuenta
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.kpis.productos_con_alerta_conteo).toBe(1)
  })

  it('CA-02: porBodega y porCategoria agregan valor_total agrupado, "—" para null', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', bodega_nombre: 'Bodega Central', categoria_nombre: 'Cables', valor_total: 50 }),
      fila({ id: 'p-2', bodega_nombre: 'Bodega Central', categoria_nombre: 'Sensores', valor_total: 30 }),
      fila({ id: 'p-3', bodega_nombre: null, categoria_nombre: null, valor_total: 10 }),
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.porBodega).toEqual(expect.arrayContaining([
      { bodega_nombre: 'Bodega Central', valor_total: 80 },
      { bodega_nombre: '—', valor_total: 10 },
    ]))
    expect(r.porCategoria).toEqual(expect.arrayContaining([
      { categoria_nombre: 'Cables', valor_total: 50 },
      { categoria_nombre: 'Sensores', valor_total: 30 },
      { categoria_nombre: '—', valor_total: 10 },
    ]))
  })

  it('CA-03: productosConAlerta solo incluye productos con al menos una alerta activa', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', saldo_existencias: 2, stock_minimo: 10 }),
      fila({ id: 'p-2', saldo_existencias: 50, stock_minimo: 10, stock_maximo: 100 }), // sin alerta
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.productosConAlerta).toHaveLength(1)
    expect(r.productosConAlerta[0]).toEqual(expect.objectContaining({ id: 'p-1', bajo_minimo: true, sobre_maximo: false, conteo_vencido: false }))
  })

  it('CA-03: un producto puede tener más de una alerta simultánea', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([
      fila({ id: 'p-1', saldo_existencias: 2, stock_minimo: 10, ultimo_conteo_fecha: hace2AniosISO }),
    ])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.productosConAlerta[0]).toEqual(expect.objectContaining({ bajo_minimo: true, conteo_vencido: true }))
  })

  it('CA-04: pasa los filtros recibidos tal cual a obtenerExistenciasValorizadas (sin transformarlos)', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([])
    const filtros = { bodega_id: 'b-1', categoria_id: 'c-1', area_id: 'a-1' }
    await obtenerResumenDashboardBodega(filtros)
    expect(mockObtenerExistenciasValorizadas).toHaveBeenCalledWith(filtros)
  })

  it('sin productos: KPIs en cero, sin crashear', async () => {
    mockObtenerExistenciasValorizadas.mockResolvedValue([])
    const r = await obtenerResumenDashboardBodega({})
    expect(r.kpis).toEqual({
      total_productos: 0, valor_total_inventario: 0,
      productos_con_alerta_stock: 0, productos_con_alerta_conteo: 0,
    })
    expect(r.porBodega).toEqual([])
    expect(r.productosConAlerta).toEqual([])
  })
})
