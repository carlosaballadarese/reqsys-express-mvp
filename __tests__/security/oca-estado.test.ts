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
} from '@/lib/oca-estado'

type Oca = {
  id: string
  estado: string
  fecha_fin: string
  presupuesto_total: number
}

function setupMock(opts: { oca: Oca; updateSpy?: jest.Mock; insertSpy?: jest.Mock }) {
  const { oca, updateSpy, insertSpy } = opts

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
})

describe('calcularPresupuestoConsumido — placeholder (CA-09)', () => {
  it('retorna siempre 0 en esta HU (no existen releases todavía)', async () => {
    expect(await calcularPresupuestoConsumido('cualquier-id')).toBe(0)
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
  // calcularPresupuestoConsumido() está fijo en 0 en esta HU (no hay releases
  // todavía) — la única forma de ejercitar la rama "agotada" a nivel unitario
  // es con presupuesto_total <= 0 (consumido >= presupuesto_total). RN-04
  // prohíbe ese valor a nivel de API/BD, así que esto solo valida el ORDEN
  // de las comparaciones dentro de calcularEstadoDestino(); la Fase D
  // (Releases, que le da contenido real a calcularPresupuestoConsumido) debe
  // re-verificar RN-08 con un consumo real distinto de cero.
  it('si presupuesto_total<=0 Y fecha_fin ya pasó, el destino es agotada (no vencida)', async () => {
    const updateSpy = jest.fn()
    setupMock({
      oca: { ...ocaBase, fecha_fin: fechaPasada(), presupuesto_total: 0 },
      updateSpy,
    })
    await actualizarEstadoOca('oca-1')
    expect(updateSpy).toHaveBeenCalledWith({ estado: 'agotada' })
  })
})
