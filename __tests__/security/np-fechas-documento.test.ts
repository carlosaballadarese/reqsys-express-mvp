// Spec: SC-001-v3.md — lib/np-fechas-documento.ts (fecha de aprobación de NP,
// rol amigable del solicitante).

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

function chainMaybeSingle(resultado: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.order = jest.fn(() => chain)
  chain.limit = jest.fn(() => chain)
  chain.maybeSingle = jest.fn(() => Promise.resolve(resultado))
  return chain
}

describe('obtenerFechaAprobacionNP', () => {
  beforeEach(() => jest.resetModules())

  it('retorna la fecha cuando existe un evento estado=aprobada en historial_np', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'historial_np') return chainMaybeSingle({ data: { fecha: '2026-07-20T10:00:00Z' }, error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerFechaAprobacionNP } = require('@/lib/np-fechas-documento')
    const fecha = await obtenerFechaAprobacionNP('np-1')
    expect(fecha).toBe('2026-07-20T10:00:00Z')
  })

  it('retorna null cuando la NP nunca fue aprobada (CA-05b)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'historial_np') return chainMaybeSingle({ data: null, error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerFechaAprobacionNP } = require('@/lib/np-fechas-documento')
    const fecha = await obtenerFechaAprobacionNP('np-2')
    expect(fecha).toBeNull()
  })

  it('ordena por fecha descendente y limita a 1 — usa la aprobación más reciente', async () => {
    let ordenLlamado: [string, { ascending: boolean }] | null = null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'historial_np') {
        const chain = chainMaybeSingle({ data: { fecha: '2026-07-25T00:00:00Z' }, error: null })
        chain.order = jest.fn((...args: unknown[]) => { ordenLlamado = args as [string, { ascending: boolean }]; return chain })
        return chain
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerFechaAprobacionNP } = require('@/lib/np-fechas-documento')
    await obtenerFechaAprobacionNP('np-3')
    expect(ordenLlamado).toEqual(['fecha', { ascending: false }])
  })
})

describe('obtenerRolSolicitante', () => {
  beforeEach(() => jest.resetModules())

  it('resuelve por creado_por_id y traduce el rol con ROL_LABEL', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') return chainMaybeSingle({ data: { rol: 'asistente_compras' }, error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerRolSolicitante } = require('@/lib/np-fechas-documento')
    const rol = await obtenerRolSolicitante({ creado_por_id: 'user-1', solicitante_email: 'sol@arlift.com' })
    expect(rol).toBe('Asistente Compras')
  })

  it('cae a solicitante_email cuando creado_por_id es null', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') return chainMaybeSingle({ data: { rol: 'solicitante' }, error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerRolSolicitante } = require('@/lib/np-fechas-documento')
    const rol = await obtenerRolSolicitante({ creado_por_id: null, solicitante_email: 'sol@arlift.com' })
    expect(rol).toBe('Solicitante')
  })

  it('cae a solicitante_email cuando la búsqueda por creado_por_id no encuentra perfil', async () => {
    let llamadas = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') {
        llamadas++
        // 1ra llamada (por id): sin resultado — 2da llamada (por email): con resultado
        return chainMaybeSingle(llamadas === 1 ? { data: null, error: null } : { data: { rol: 'coordinador' }, error: null })
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerRolSolicitante } = require('@/lib/np-fechas-documento')
    const rol = await obtenerRolSolicitante({ creado_por_id: 'user-fantasma', solicitante_email: 'sol@arlift.com' })
    expect(rol).toBe('Coordinador')
    expect(llamadas).toBe(2)
  })

  it('retorna null si no se encuentra el perfil por ningún criterio', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') return chainMaybeSingle({ data: null, error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const { obtenerRolSolicitante } = require('@/lib/np-fechas-documento')
    const rol = await obtenerRolSolicitante({ creado_por_id: null, solicitante_email: 'nadie@arlift.com' })
    expect(rol).toBeNull()
  })
})
