// Spec: HU-025-v2.md — CA-01 a CA-07

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => ({ from: mockFrom }),
}))

const mockObtenerEstadoOcas = jest.fn()
const mockObtenerConsumoPorCentroCosto = jest.fn()
const mockObtenerDetalleReleases = jest.fn()
jest.mock('@/lib/oca-reportes-query', () => ({
  obtenerEstadoOcas: (...args: unknown[]) => mockObtenerEstadoOcas(...args),
  obtenerConsumoPorCentroCosto: (...args: unknown[]) => mockObtenerConsumoPorCentroCosto(...args),
  obtenerDetalleReleases: (...args: unknown[]) => mockObtenerDetalleReleases(...args),
}))

import { obtenerResumenDashboard } from '@/lib/oca-dashboard-query'

const ocaVigenteSinAlerta = {
  id: 'oca-1', numero_oca: 'OCA-2026-0001', proveedor_nombre: 'Prov A', tipo: 'precio_fijo',
  fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', presupuesto_total: 1000, consumido: 100,
  disponible: 900, porcentaje_ejecucion: 10, estado: 'vigente',
}
const ocaVigenteConAlertaPresupuesto = {
  id: 'oca-2', numero_oca: 'OCA-2026-0002', proveedor_nombre: 'Prov B', tipo: 'precio_fijo',
  fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', presupuesto_total: 1000, consumido: 950,
  disponible: 50, porcentaje_ejecucion: 95, estado: 'vigente',
}
const ocaAgotada = {
  id: 'oca-3', numero_oca: 'OCA-2026-0003', proveedor_nombre: 'Prov C', tipo: 'precio_fijo',
  fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', presupuesto_total: 500, consumido: 500,
  disponible: 0, porcentaje_ejecucion: 100, estado: 'agotada',
}

function setupMock(opts: {
  ocas?: unknown[]
  consumoCentroCosto?: unknown[]
  releasesAprobados?: { created_at: string; monto_total: number; estado: string }[]
  releasesPendientes?: { created_at: string; estado: string }[]
  habilitadasPorArea?: { oca_id: string }[]
} = {}) {
  mockObtenerEstadoOcas.mockResolvedValue(opts.ocas ?? [ocaVigenteSinAlerta])
  mockObtenerConsumoPorCentroCosto.mockResolvedValue(opts.consumoCentroCosto ?? [])
  mockObtenerDetalleReleases.mockImplementation((filtros: { estado?: string }) => {
    if (filtros.estado === 'aprobado') return Promise.resolve(opts.releasesAprobados ?? [])
    if (filtros.estado === 'pendiente_aprobacion') return Promise.resolve(opts.releasesPendientes ?? [])
    return Promise.resolve([])
  })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'oca_areas_habilitadas') {
      return { select: () => ({ eq: () => Promise.resolve({ data: opts.habilitadasPorArea ?? [], error: null }) }) }
    }
    return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
  })
}

describe('obtenerResumenDashboard (CA-01 a CA-07)', () => {
  it('CA-01/CA-02: agrega KPIs (total, por_estado, presupuesto/consumido/disponible, % global)', async () => {
    setupMock({ ocas: [ocaVigenteSinAlerta, ocaAgotada] })
    const r = await obtenerResumenDashboard({})
    expect(r.kpis).toEqual(expect.objectContaining({
      total: 2,
      por_estado: { vigente: 1, agotada: 1 },
      presupuesto_total: 1500,
      consumido_total: 600,
      disponible_total: 900,
      porcentaje_ejecucion_global: 40,
    }))
  })

  it('CA-03: porEstado tiene la forma esperada para el pie chart', async () => {
    setupMock({ ocas: [ocaVigenteSinAlerta, ocaAgotada] })
    const r = await obtenerResumenDashboard({})
    expect(r.porEstado.sort((a, b) => a.estado.localeCompare(b.estado))).toEqual([
      { estado: 'agotada', count: 1 },
      { estado: 'vigente', count: 1 },
    ])
  })

  it('CA-04: porCentroCosto reutiliza obtenerConsumoPorCentroCosto() tal cual', async () => {
    setupMock({ consumoCentroCosto: [{ area_id: 'area-1', area_nombre: 'TI', monto_consumido: 300, cantidad_releases: 2 }] })
    const r = await obtenerResumenDashboard({})
    expect(r.porCentroCosto).toEqual([{ area_nombre: 'TI', monto_consumido: 300, cantidad_releases: 2 }])
  })

  it('CA-05: porMes agrupa releases aprobados por mes (created_at)', async () => {
    setupMock({
      releasesAprobados: [
        { created_at: '2026-09-01T00:00:00Z', monto_total: 100, estado: 'aprobado' },
        { created_at: '2026-09-15T00:00:00Z', monto_total: 50, estado: 'aprobado' },
        { created_at: '2026-10-01T00:00:00Z', monto_total: 200, estado: 'aprobado' },
      ],
    })
    const r = await obtenerResumenDashboard({})
    expect(r.porMes).toEqual([{ mes: '2026-09', monto: 150 }, { mes: '2026-10', monto: 200 }])
  })

  it('CA-06: ocasConAlerta solo incluye OCAs con alerta_presupuesto o alerta_vigencia activa', async () => {
    setupMock({ ocas: [ocaVigenteSinAlerta, ocaVigenteConAlertaPresupuesto] })
    const r = await obtenerResumenDashboard({})
    expect(r.ocasConAlerta).toHaveLength(1)
    expect(r.ocasConAlerta[0]).toEqual(expect.objectContaining({ id: 'oca-2', alerta_presupuesto: '90' }))
  })

  it('CA-06: una OCA sin ninguna alerta activa no aparece en ocasConAlerta', async () => {
    setupMock({ ocas: [ocaVigenteSinAlerta] })
    const r = await obtenerResumenDashboard({})
    expect(r.ocasConAlerta).toEqual([])
  })

  it('CA-07: releases_pendientes_con_alerta cuenta solo los pendientes con >24h', async () => {
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    setupMock({
      releasesPendientes: [
        { created_at: hace48h, estado: 'pendiente_aprobacion' },
        { created_at: hace2h, estado: 'pendiente_aprobacion' },
      ],
    })
    const r = await obtenerResumenDashboard({})
    expect(r.kpis.releases_pendientes_con_alerta).toBe(1)
  })

  it('filtro de area_id excluye OCAs no habilitadas para esa área (post-filtro)', async () => {
    setupMock({
      ocas: [ocaVigenteSinAlerta, ocaVigenteConAlertaPresupuesto],
      habilitadasPorArea: [{ oca_id: 'oca-1' }],
    })
    const r = await obtenerResumenDashboard({ area_id: 'area-1' })
    expect(r.kpis.total).toBe(1)
    expect(r.porEstado).toEqual([{ estado: 'vigente', count: 1 }])
  })
})
