// Spec: HU-023-v2.md — CA-01 a CA-04

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import {
  ROLES_REPORTES_OCA,
  obtenerEstadoOcas,
  obtenerDetalleReleases,
  obtenerConsumoPorCentroCosto,
  obtenerHistoricoEnmiendas,
} from '@/lib/oca-reportes-query'

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
  chain.then = (resolve: any, reject: any) => Promise.resolve(resolved).then(resolve, reject)
  return chain
}

describe('ROLES_REPORTES_OCA', () => {
  it('incluye compras/admin/asistente_compras/gerencia, excluye el resto', () => {
    expect(ROLES_REPORTES_OCA.sort()).toEqual(['admin', 'asistente_compras', 'compras', 'gerencia'].sort())
    expect(ROLES_REPORTES_OCA).not.toContain('coordinador')
    expect(ROLES_REPORTES_OCA).not.toContain('solicitante')
  })
})

describe('obtenerEstadoOcas (CA-01)', () => {
  const ocaBase = { id: 'oca-1', numero_oca: 'OCA-2026-0001', proveedor_id: 'prov-1', tipo: 'precio_fijo', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', presupuesto_total: 1000, estado: 'vigente' }

  function setupMock(opts: { ocas?: unknown[]; releases?: { oca_id: string; monto_total: number }[]; proveedores?: { id: string; nombre: string }[] } = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca') return mockChain(opts.ocas ?? [ocaBase])
      if (table === 'oca_releases') return mockChain(opts.releases ?? [])
      if (table === 'proveedores') return mockChain(opts.proveedores ?? [{ id: 'prov-1', nombre: 'Proveedor X' }])
      return mockChain([])
    })
  }

  it('calcula consumido/disponible/porcentaje_ejecucion solo con releases aprobado', async () => {
    setupMock({ releases: [{ oca_id: 'oca-1', monto_total: 300 }] })
    const filas = await obtenerEstadoOcas({})
    expect(filas).toEqual([
      expect.objectContaining({ id: 'oca-1', proveedor_nombre: 'Proveedor X', consumido: 300, disponible: 700, porcentaje_ejecucion: 30 }),
    ])
  })

  it('consumido=0 cuando no hay releases aprobados', async () => {
    setupMock()
    const filas = await obtenerEstadoOcas({})
    expect(filas[0]).toEqual(expect.objectContaining({ consumido: 0, disponible: 1000, porcentaje_ejecucion: 0 }))
  })

  it('aplica el filtro de estado', async () => {
    let filtroAplicado: unknown = null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca') {
        const chain = mockChain([ocaBase])
        chain.eq = jest.fn((campo: string, valor: unknown) => { filtroAplicado = { campo, valor }; return chain })
        return chain
      }
      return mockChain([])
    })
    await obtenerEstadoOcas({ estado: 'vigente' })
    expect(filtroAplicado).toEqual({ campo: 'estado', valor: 'vigente' })
  })
})

describe('obtenerDetalleReleases (CA-02)', () => {
  const releaseBase = {
    id: 'rel-1', numero_release: 'OCA-2026-0001-R001', oca_id: 'oca-1', area_id: 'area-1',
    solicitante_id: 'user-1', monto_total: 100, estado: 'aprobado', facturado: true, numero_factura: 'FAC-001', created_at: '2026-10-01',
  }

  function setupMock() {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca_releases') return mockChain([releaseBase])
      if (table === 'oca') return mockChain([{ id: 'oca-1', numero_oca: 'OCA-2026-0001', proveedor_id: 'prov-1' }])
      if (table === 'areas') return mockChain([{ id: 'area-1', nombre: 'TI' }])
      if (table === 'perfiles') return mockChain([{ id: 'user-1', nombre: 'Juan Pérez' }])
      if (table === 'proveedores') return mockChain([{ id: 'prov-1', nombre: 'Proveedor X' }])
      return mockChain([])
    })
  }

  it('enriquece con numero_oca/area_nombre/solicitante_nombre/proveedor_nombre y expone facturado/numero_factura', async () => {
    setupMock()
    const filas = await obtenerDetalleReleases({})
    expect(filas).toEqual([
      expect.objectContaining({
        numero_oca: 'OCA-2026-0001', area_nombre: 'TI', solicitante_nombre: 'Juan Pérez',
        proveedor_nombre: 'Proveedor X', facturado: true, numero_factura: 'FAC-001',
      }),
    ])
  })

  it('no filtra por estado (incluye releases en cualquier estado, a diferencia de la bandeja de pendientes)', async () => {
    let filtroEstado: unknown = 'no-llamado'
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca_releases') {
        const chain = mockChain([releaseBase])
        const eqOriginal = chain.eq
        chain.eq = jest.fn((campo: string, valor: unknown) => { if (campo === 'estado') filtroEstado = valor; return eqOriginal(campo, valor) })
        return chain
      }
      if (table === 'oca') return mockChain([])
      if (table === 'areas') return mockChain([])
      if (table === 'perfiles') return mockChain([])
      return mockChain([])
    })
    await obtenerDetalleReleases({})
    expect(filtroEstado).toBe('no-llamado')
  })
})

describe('obtenerConsumoPorCentroCosto (CA-03)', () => {
  it('agrega monto_consumido y cantidad_releases por área, solo releases aprobado', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca_releases') {
        return mockChain([
          { area_id: 'area-1', monto_total: 100, oca_id: 'oca-1', created_at: '2026-10-01' },
          { area_id: 'area-1', monto_total: 50, oca_id: 'oca-1', created_at: '2026-10-02' },
          { area_id: 'area-2', monto_total: 200, oca_id: 'oca-1', created_at: '2026-10-03' },
        ])
      }
      if (table === 'areas') return mockChain([{ id: 'area-1', nombre: 'TI' }, { id: 'area-2', nombre: 'Compras' }])
      return mockChain([])
    })
    const filas = await obtenerConsumoPorCentroCosto({})
    expect(filas).toEqual([
      { area_id: 'area-2', area_nombre: 'Compras', monto_consumido: 200, cantidad_releases: 1 },
      { area_id: 'area-1', area_nombre: 'TI', monto_consumido: 150, cantidad_releases: 2 },
    ])
  })

  it('solo consulta releases con estado=aprobado', async () => {
    let filtroEstado: unknown = null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca_releases') {
        const chain = mockChain([])
        chain.eq = jest.fn((campo: string, valor: unknown) => { filtroEstado = { campo, valor }; return chain })
        return chain
      }
      return mockChain([])
    })
    await obtenerConsumoPorCentroCosto({})
    expect(filtroEstado).toEqual({ campo: 'estado', valor: 'aprobado' })
  })
})

describe('obtenerHistoricoEnmiendas (CA-04)', () => {
  function setupMock(enmiendas: unknown[]) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'oca_enmiendas') return mockChain(enmiendas)
      if (table === 'oca') return mockChain([{ id: 'oca-1', numero_oca: 'OCA-2026-0001' }])
      if (table === 'perfiles') return mockChain([{ id: 'user-1', nombre: 'Gerente G' }, { id: 'user-2', nombre: 'Solicitante S' }])
      return mockChain([])
    })
  }

  it('enriquece con numero_oca/solicitante_nombre/aprobador_nombre', async () => {
    setupMock([{
      id: 'enm-1', oca_id: 'oca-1', tipo: 'incremento_presupuesto', estado: 'aprobada',
      solicitado_por_id: 'user-2', solicitado_en: '2026-10-01', aprobado_por_id: 'user-1', aprobado_en: '2026-10-02', motivo_rechazo: null,
    }])
    const filas = await obtenerHistoricoEnmiendas({})
    expect(filas).toEqual([
      expect.objectContaining({ numero_oca: 'OCA-2026-0001', solicitante_nombre: 'Solicitante S', aprobador_nombre: 'Gerente G' }),
    ])
  })

  it('aprobador_nombre=null cuando la enmienda sigue pendiente (aprobado_por_id=null)', async () => {
    setupMock([{
      id: 'enm-1', oca_id: 'oca-1', tipo: 'extension_plazo', estado: 'pendiente',
      solicitado_por_id: 'user-2', solicitado_en: '2026-10-01', aprobado_por_id: null, aprobado_en: null, motivo_rechazo: null,
    }])
    const filas = await obtenerHistoricoEnmiendas({})
    expect(filas[0].aprobador_nombre).toBeNull()
  })

  it('incluye enmiendas rechazadas con motivo_rechazo', async () => {
    setupMock([{
      id: 'enm-1', oca_id: 'oca-1', tipo: 'incremento_presupuesto', estado: 'rechazada',
      solicitado_por_id: 'user-2', solicitado_en: '2026-10-01', aprobado_por_id: 'user-1', aprobado_en: '2026-10-02', motivo_rechazo: 'Sin soporte contractual',
    }])
    const filas = await obtenerHistoricoEnmiendas({})
    expect(filas[0].motivo_rechazo).toBe('Sin soporte contractual')
  })
})
