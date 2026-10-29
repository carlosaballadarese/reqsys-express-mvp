// Spec: HU-018-v2.md — CA-07, CA-08, CA-09, RN-08
//
// Cubre actualizarEstadoOca() directamente contra un mock de adminClient()
// (sin pasar por HTTP), mismo patrón ya usado en np-estado-actualizar.test.ts.

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import {
  actualizarEstadoOca,
  calcularPresupuestoConsumido,
  ESTADOS_OCA_AUTOGESTIONADOS,
  ESTADOS_OCA_NO_TERMINALES,
  ESTADOS_OCA_ACTIVA,
  ESTADOS_OCA_VIVAS,
} from '@/lib/oca-estado'

type Oca = {
  id: string
  estado: string
  fecha_fin: string
  presupuesto_total: number
}

function setupMock(opts: {
  oca: Oca
  updateSpy?: jest.Mock
  insertSpy?: jest.Mock
  releasesAprobados?: { monto_total: number }[]
}) {
  const { oca, updateSpy, insertSpy, releasesAprobados = [] } = opts

  mockFrom.mockImplementation((table: string) => {
    if (table === 'oca') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: oca, error: null }) }) }),
        update: (payload: unknown) => {
          updateSpy?.(payload)
          return { eq: () => Promise.resolve({ data: {}, error: null }) }
        },
      }
    }
    if (table === 'historial_oca') {
      return { insert: (payload: unknown) => { insertSpy?.(payload); return Promise.resolve({ data: {}, error: null }) } }
    }
    if (table === 'oca_releases') {
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: releasesAprobados, error: null }) }) }) }
    }
    throw new Error(`tabla no mockeada: ${table}`)
  })
}

function fechaFutura(): string {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10)
}
function fechaPasada(): string {
  const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10)
}

const ocaBase: Oca = {
  id: 'oca-1', estado: 'vigente', fecha_fin: fechaFutura(), presupuesto_total: 1000,
}

describe('ESTADOS_OCA_* — constantes (CA-07, CA-09, CA-11)', () => {
  it('ESTADOS_OCA_AUTOGESTIONADOS solo incluye vigente', () => {
    expect(ESTADOS_OCA_AUTOGESTIONADOS).toEqual(['vigente'])
  })
  it('ESTADOS_OCA_ACTIVA solo incluye vigente (CA-07 — único estado que permite releases)', () => {
    expect(ESTADOS_OCA_ACTIVA).toEqual(['vigente'])
  })
  it('ESTADOS_OCA_NO_TERMINALES incluye los 4 estados cerrables (CA-11)', () => {
    expect(ESTADOS_OCA_NO_TERMINALES.sort()).toEqual(
      ['agotada', 'suspendida', 'vencida', 'vigente'].sort()
    )
  })
  it('ESTADOS_OCA_VIVAS incluye los 6 estados salvo cerrada (HU-019 RN-01)', () => {
    expect(ESTADOS_OCA_VIVAS.sort()).toEqual(
      ['borrador', 'en_aprobacion', 'vigente', 'suspendida', 'agotada', 'vencida'].sort()
    )
    expect(ESTADOS_OCA_VIVAS).not.toContain('cerrada')
  })
})

describe('calcularPresupuestoConsumido — HU-021 CA-10 (conectado a releases reales)', () => {
  it('retorna 0 sin releases aprobados', async () => {
    setupMock({ oca: ocaBase, releasesAprobados: [] })
    expect(await calcularPresupuestoConsumido('oca-1')).toBe(0)
  })

  it('suma monto_total de los releases en estado aprobado', async () => {
    setupMock({ oca: ocaBase, releasesAprobados: [{ monto_total: 300 }, { monto_total: 150.5 }] })
    expect(await calcularPresupuestoConsumido('oca-1')).toBe(450.5)
  })

  it('la consulta filtra por estado=aprobado — releases pendientes/rechazados/anulados no llegan a este resultado (filtrado en BD, no en JS)', async () => {
    // El mock de oca_releases ya simula el filtro .eq('estado','aprobado') hecho
    // por la propia query — este test documenta la expectativa de contrato.
    setupMock({ oca: ocaBase, releasesAprobados: [{ monto_total: 100 }] })
    expect(await calcularPresupuestoConsumido('oca-1')).toBe(100)
  })
})

describe('actualizarEstadoOca — RN-01/guard (solo estados autogestionados)', () => {
  it.each(['borrador', 'en_aprobacion', 'suspendida', 'agotada', 'vencida', 'cerrada'])(
    'no hace nada si el estado actual es %s (fuera de ESTADOS_OCA_AUTOGESTIONADOS)',
    async (estado) => {
      const updateSpy = jest.fn()
      setupMock({ oca: { ...ocaBase, estado }, updateSpy })
      await actualizarEstadoOca('oca-1')
      expect(updateSpy).not.toHaveBeenCalled()
    }
  )
})

describe('actualizarEstadoOca — CA-08 (derivación de vencida)', () => {
  it('permanece en vigente si fecha_fin es futura (sin cambio)', async () => {
    const updateSpy = jest.fn()
    setupMock({ oca: { ...ocaBase, fecha_fin: fechaFutura() }, updateSpy })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('transiciona a vencida si fecha_fin ya pasó', async () => {
    const updateSpy = jest.fn()
    const insertSpy = jest.fn()
    setupMock({ oca: { ...ocaBase, fecha_fin: fechaPasada() }, updateSpy, insertSpy })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).toHaveBeenCalledWith({ estado: 'vencida' })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      oca_id: 'oca-1', estado: 'vencida', actor_nombre: 'Sistema',
    }))
  })
})

describe('actualizarEstadoOca — RN-08 (agotada prevalece sobre vencida en empate)', () => {
  it('si presupuesto_total<=0 Y fecha_fin ya pasó, el destino es agotada (no vencida)', async () => {
    const updateSpy = jest.fn()
    setupMock({
      oca: { ...ocaBase, fecha_fin: fechaPasada(), presupuesto_total: 0 },
      updateSpy,
    })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).toHaveBeenCalledWith({ estado: 'agotada' })
  })

  // Spec: HU-021 CA-10 — primera verificación de RN-08 con consumo real
  // distinto de cero, ahora que calcularPresupuestoConsumido() está
  // conectado a releases reales (antes solo se podía probar con
  // presupuesto_total<=0, ver historial de este archivo).
  it('deriva agotada cuando la suma de releases aprobados alcanza el presupuesto_total (dato real, fecha_fin futura)', async () => {
    const updateSpy = jest.fn()
    setupMock({
      oca: { ...ocaBase, fecha_fin: fechaFutura(), presupuesto_total: 500 },
      updateSpy,
      releasesAprobados: [{ monto_total: 300 }, { monto_total: 200 }],
    })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).toHaveBeenCalledWith({ estado: 'agotada' })
  })

  it('permanece vigente si la suma de releases aprobados no alcanza el presupuesto_total', async () => {
    const updateSpy = jest.fn()
    setupMock({
      oca: { ...ocaBase, fecha_fin: fechaFutura(), presupuesto_total: 500 },
      updateSpy,
      releasesAprobados: [{ monto_total: 300 }],
    })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
