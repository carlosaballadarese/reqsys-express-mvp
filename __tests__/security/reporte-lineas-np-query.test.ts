// Spec: SC-007 — Reporte de líneas NP/OC/OCA con trazabilidad completa.
// Cubre parsearFiltrosReporteLineas, emparejarCobertura y obtenerFilasReporteLineas
// directamente contra un mock de adminClient() (sin pasar por HTTP) — mismo criterio
// que np-cobertura.test.ts.

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

const mockObtenerFechasAprobacionNPBulk = jest.fn((npIds: string[]) =>
  Promise.resolve(new Map<string, string | null>(npIds.map(id => [id, null])))
)
jest.mock('@/lib/np-fechas-documento', () => ({
  obtenerFechasAprobacionNPBulk: (...args: [string[]]) => mockObtenerFechasAprobacionNPBulk(...args),
}))

import {
  parsearFiltrosReporteLineas,
  emparejarCobertura,
  obtenerFilasReporteLineas,
} from '@/lib/reporte-lineas-np-query'

describe('parsearFiltrosReporteLineas', () => {
  it('parsea todos los filtros cuando están presentes', () => {
    const sp = new URLSearchParams({
      fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31',
      area: 'Operaciones', proveedor: ' Ferretería X ', estado_np: 'aprobada',
    })
    expect(parsearFiltrosReporteLineas(sp)).toEqual({
      fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31',
      area: 'Operaciones', proveedor: 'Ferretería X', estado_np: 'aprobada',
    })
  })

  it('retorna null para cada filtro ausente', () => {
    const sp = new URLSearchParams()
    expect(parsearFiltrosReporteLineas(sp)).toEqual({
      fecha_desde: null, fecha_hasta: null, area: null, proveedor: null, estado_np: null,
    })
  })
})

describe('emparejarCobertura', () => {
  it('0 OC / 0 OCA → 1 fila con ambos bloques en blanco (CA-02)', () => {
    const filas = emparejarCobertura([], [])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      oc_numero: null, oc_proveedor: null, oc_precio_unitario: null, oc_fecha_aprobada: null,
      oca_numero: null, oca_proveedor: null, oca_fecha_aprobada: null,
    })
  })

  const oc1 = { oc_numero: 'OC-1', oc_proveedor: 'Prov OC', oc_precio_unitario: 10, oc_fecha_aprobada: '2026-01-01' }
  const oca1 = { oca_numero: 'OCA-1', oca_proveedor: 'Prov OCA', oca_fecha_aprobada: '2026-02-01' }

  it('1 OC / 0 OCA → 1 fila con bloque OCA en blanco', () => {
    const filas = emparejarCobertura([oc1], [])
    expect(filas).toHaveLength(1)
    expect(filas[0].oc_numero).toBe('OC-1')
    expect(filas[0].oca_numero).toBeNull()
  })

  it('0 OC / 1 OCA → 1 fila con bloque OC en blanco', () => {
    const filas = emparejarCobertura([], [oca1])
    expect(filas).toHaveLength(1)
    expect(filas[0].oc_numero).toBeNull()
    expect(filas[0].oca_numero).toBe('OCA-1')
  })

  it('1 OC / 1 OCA simultáneas (CA-05) → 1 fila con ambos bloques llenos', () => {
    const filas = emparejarCobertura([oc1], [oca1])
    expect(filas).toHaveLength(1)
    expect(filas[0].oc_numero).toBe('OC-1')
    expect(filas[0].oca_numero).toBe('OCA-1')
  })

  it('2 OC / 1 OCA (CA-03b) → 2 filas por posición, la 2da con OCA en blanco', () => {
    const oc2 = { oc_numero: 'OC-2', oc_proveedor: 'Prov OC 2', oc_precio_unitario: 20, oc_fecha_aprobada: '2026-03-01' }
    const filas = emparejarCobertura([oc1, oc2], [oca1])
    expect(filas).toHaveLength(2)
    expect(filas[0].oc_numero).toBe('OC-1')
    expect(filas[0].oca_numero).toBe('OCA-1')
    expect(filas[1].oc_numero).toBe('OC-2')
    expect(filas[1].oca_numero).toBeNull()
  })

  it('1 OC / 2 OCA → 2 filas por posición, la 2da con OC en blanco', () => {
    const oca2 = { oca_numero: 'OCA-2', oca_proveedor: 'Prov OCA 2', oca_fecha_aprobada: '2026-04-01' }
    const filas = emparejarCobertura([oc1], [oca1, oca2])
    expect(filas).toHaveLength(2)
    expect(filas[0].oca_numero).toBe('OCA-1')
    expect(filas[1].oc_numero).toBeNull()
    expect(filas[1].oca_numero).toBe('OCA-2')
  })
})

describe('obtenerFilasReporteLineas', () => {
  function chainAwaitable(data: unknown) {
    const chain: any = {}
    const noop = jest.fn(() => chain)
    chain.select = noop
    chain.order = noop
    chain.eq = noop
    chain.ilike = noop
    chain.in = noop
    chain.not = jest.fn(() => Promise.resolve({ data, error: null }))
    chain.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
    return chain
  }

  const npBase = { id: 'np-1', numero: 'NP-2026-0001', area: 'Operaciones', estado: 'aprobada' }
  const itemBase = {
    id: 'item-1', nota_pedido_id: 'np-1', linea: 1, codigo: 'AL-I0001',
    descripcion: 'Tubo de acero', cantidad: 2, precio_unitario: 10, proveedor_sugerido: 'Ferretería X',
  }

  function setup(opts: {
    nps?: any[]; itemsNp?: any[]; itemsOc?: any[]; ocs?: any[]
    ocaItems?: any[]; ocas?: any[]; proveedores?: any[]
  }) {
    const {
      nps = [npBase], itemsNp = [itemBase], itemsOc = [], ocs = [],
      ocaItems = [], ocas = [], proveedores = [],
    } = opts
    mockFrom.mockImplementation((table: string) => {
      if (table === 'notas_pedido') return chainAwaitable(nps)
      if (table === 'items_np') return chainAwaitable(itemsNp)
      if (table === 'items_oc') return chainAwaitable(itemsOc)
      if (table === 'registro_compras') return chainAwaitable(ocs)
      if (table === 'oca_items') return chainAwaitable(ocaItems)
      if (table === 'oca') return chainAwaitable(ocas)
      if (table === 'proveedores') return chainAwaitable(proveedores)
      throw new Error(`tabla no mockeada: ${table}`)
    })
  }

  beforeEach(() => {
    mockObtenerFechasAprobacionNPBulk.mockImplementation((npIds: string[]) =>
      Promise.resolve(new Map<string, string | null>(npIds.map(id => [id, null])))
    )
  })

  it('CA-01/CA-02: una línea sin ninguna OC ni OCA produce exactamente 1 fila en blanco', async () => {
    setup({})
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toHaveLength(1)
    expect(filas[0].np_numero).toBe('NP-2026-0001')
    expect(filas[0].oc_numero).toBeNull()
    expect(filas[0].oca_numero).toBeNull()
  })

  it('retorna [] cuando no hay ninguna NP (CA-07 sin resultados)', async () => {
    setup({ nps: [] })
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toEqual([])
  })

  it('línea con 1 OC real: trae numero_oc, proveedor, precio_unitario y fecha de aprobación', async () => {
    setup({
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1', precio_unitario: 12.5 }],
      ocs: [{ id: 'oc-1', numero_oc: 'OC-2026-0001', proveedor: 'Proveedor Real OC', aprobado_en: '2026-06-01T00:00:00Z' }],
    })
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toHaveLength(1)
    expect(filas[0].oc_numero).toBe('OC-2026-0001')
    expect(filas[0].oc_proveedor).toBe('Proveedor Real OC')
    expect(filas[0].oc_precio_unitario).toBe(12.5)
    expect(filas[0].oc_fecha_aprobada).toBe('2026-06-01T00:00:00Z')
  })

  it('línea con 1 OCA vigente: trae numero_oca, proveedor (vía proveedores.nombre) y fecha de aprobación', async () => {
    setup({
      ocaItems: [{ item_np_id: 'item-1', oca_id: 'oca-1' }],
      ocas: [{ id: 'oca-1', numero_oca: 'OCA-2026-0001', proveedor_id: 'prov-1', aprobado_en: '2026-05-01T00:00:00Z' }],
      proveedores: [{ id: 'prov-1', nombre: 'Proveedor Real OCA' }],
    })
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toHaveLength(1)
    expect(filas[0].oca_numero).toBe('OCA-2026-0001')
    expect(filas[0].oca_proveedor).toBe('Proveedor Real OCA')
    expect(filas[0].oca_fecha_aprobada).toBe('2026-05-01T00:00:00Z')
  })

  it('CA-05: OC real y cobertura OCA simultáneas en la misma línea aparecen en la misma fila', async () => {
    setup({
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1', precio_unitario: 12.5 }],
      ocs: [{ id: 'oc-1', numero_oc: 'OC-2026-0001', proveedor: 'Proveedor OC', aprobado_en: null }],
      ocaItems: [{ item_np_id: 'item-1', oca_id: 'oca-1' }],
      ocas: [{ id: 'oca-1', numero_oca: 'OCA-2026-0001', proveedor_id: 'prov-1', aprobado_en: '2026-05-01T00:00:00Z' }],
      proveedores: [{ id: 'prov-1', nombre: 'Proveedor OCA' }],
    })
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toHaveLength(1)
    expect(filas[0].oc_numero).toBe('OC-2026-0001')
    expect(filas[0].oca_numero).toBe('OCA-2026-0001')
    // CA-06/RN-05: las 3 columnas de proveedor son independientes — ninguna es fallback de otra
    expect(filas[0].proveedor_sugerido).toBe('Ferretería X')
    expect(filas[0].oc_proveedor).toBe('Proveedor OC')
    expect(filas[0].oca_proveedor).toBe('Proveedor OCA')
  })

  it('CA-03b: una línea cubierta por 2 OCs reales produce 2 filas, repitiendo número de NP y línea', async () => {
    setup({
      itemsOc: [
        { item_np_id: 'item-1', registro_compras_id: 'oc-1', precio_unitario: 5 },
        { item_np_id: 'item-1', registro_compras_id: 'oc-2', precio_unitario: 7 },
      ],
      ocs: [
        { id: 'oc-1', numero_oc: 'OC-2026-0001', proveedor: 'Prov A', aprobado_en: '2026-01-01T00:00:00Z' },
        { id: 'oc-2', numero_oc: 'OC-2026-0002', proveedor: 'Prov B', aprobado_en: '2026-02-01T00:00:00Z' },
      ],
    })
    const filas = await obtenerFilasReporteLineas({})
    expect(filas).toHaveLength(2)
    expect(filas[0].np_numero).toBe('NP-2026-0001')
    expect(filas[1].np_numero).toBe('NP-2026-0001')
    expect(filas[0].linea).toBe(1)
    expect(filas[1].linea).toBe(1)
    expect([filas[0].oc_numero, filas[1].oc_numero].sort()).toEqual(['OC-2026-0001', 'OC-2026-0002'])
  })

  it('aplica el filtro de área vía ilike en la query de notas_pedido', async () => {
    let chainNP: any
    mockFrom.mockImplementation((table: string) => {
      if (table === 'notas_pedido') { chainNP = chainAwaitable([]); return chainNP }
      return chainAwaitable([])
    })
    await obtenerFilasReporteLineas({ area: 'Operaciones' })
    expect(chainNP.ilike).toHaveBeenCalledWith('area', '%Operaciones%')
  })

  it('aplica el filtro de estado_np vía eq en la query de notas_pedido', async () => {
    let chainNP: any
    mockFrom.mockImplementation((table: string) => {
      if (table === 'notas_pedido') { chainNP = chainAwaitable([]); return chainNP }
      return chainAwaitable([])
    })
    await obtenerFilasReporteLineas({ estado_np: 'completada' })
    expect(chainNP.eq).toHaveBeenCalledWith('estado', 'completada')
  })

  it('filtra por rango de fecha de aprobación de NP (derivada, en JS)', async () => {
    setup({})
    mockObtenerFechasAprobacionNPBulk.mockResolvedValueOnce(new Map([['np-1', '2026-03-15T00:00:00Z']]))
    const dentro = await obtenerFilasReporteLineas({ fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31' })
    expect(dentro).toHaveLength(1)

    mockObtenerFechasAprobacionNPBulk.mockResolvedValueOnce(new Map([['np-1', '2026-03-15T00:00:00Z']]))
    const fuera = await obtenerFilasReporteLineas({ fecha_desde: '2026-06-01', fecha_hasta: '2026-12-31' })
    expect(fuera).toEqual([])

    mockObtenerFechasAprobacionNPBulk.mockResolvedValueOnce(new Map([['np-1', null]]))
    const sinAprobar = await obtenerFilasReporteLineas({ fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31' })
    expect(sinAprobar).toEqual([])
  })

  it('post-filtra por proveedor contra las 3 columnas (sugerido, OC, OCA)', async () => {
    setup({
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1', precio_unitario: 10 }],
      ocs: [{ id: 'oc-1', numero_oc: 'OC-2026-0001', proveedor: 'Distribuidora Andina', aprobado_en: null }],
    })
    const match = await obtenerFilasReporteLineas({ proveedor: 'andina' })
    expect(match).toHaveLength(1)

    const noMatch = await obtenerFilasReporteLineas({ proveedor: 'inexistente' })
    expect(noMatch).toEqual([])
  })
})
