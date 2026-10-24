// Spec: HU-021-v2.md — RN-02

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import { esAutorizadoParaResolverRelease } from '@/lib/oca-release-autorizacion'

function mockCoordinador(data: { email: string } | null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'coordinadores_area') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    throw new Error(`tabla inesperada: ${table}`)
  })
}

describe('esAutorizadoParaResolverRelease', () => {
  it('rol compras autorizado sin consultar BD', async () => {
    const ok = await esAutorizadoParaResolverRelease('compras', 'x@a.com', null)
    expect(ok).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rol admin autorizado sin consultar BD', async () => {
    const ok = await esAutorizadoParaResolverRelease('admin', 'x@a.com', 'coord-1')
    expect(ok).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rol no privilegiado sin aprobador_asignado_id -> false sin consultar BD', async () => {
    const ok = await esAutorizadoParaResolverRelease('solicitante', 'x@a.com', null)
    expect(ok).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rol no privilegiado, email coincide con el coordinador activo -> true', async () => {
    mockCoordinador({ email: 'coord@arlift.com' })
    const ok = await esAutorizadoParaResolverRelease('asistente_compras', 'coord@arlift.com', 'coord-1')
    expect(ok).toBe(true)
  })

  it('rol no privilegiado, email no coincide (o coordinador inactivo) -> false', async () => {
    mockCoordinador(null)
    const ok = await esAutorizadoParaResolverRelease('asistente_compras', 'otro@arlift.com', 'coord-1')
    expect(ok).toBe(false)
  })

  it('rol coordinador legítimo del área -> true', async () => {
    mockCoordinador({ email: 'coord@arlift.com' })
    const ok = await esAutorizadoParaResolverRelease('coordinador', 'coord@arlift.com', 'coord-1')
    expect(ok).toBe(true)
  })
})
