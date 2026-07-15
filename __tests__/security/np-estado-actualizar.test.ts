// Spec: HU-009-v3.md — CA-03, CA-08, CA-09, RN-01, RN-02, RN-04
//
// Cubre actualizarEstadoNP() y pausarSLAPorCierre() directamente contra un mock de
// adminClient() (sin pasar por HTTP) — cierra el gap señalado en la Fase 5 SDD: los
// tests de integración de las Tareas 18-23 (auth-protection.test.ts, sección 41) solo
// verifican que la función se invoca, no que el algoritmo de derivación de Estado sea
// correcto.

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import { actualizarEstadoNP, pausarSLAPorCierre } from '@/lib/np-estado'

type NP = {
  id: string
  estado: string
  asignado_a: string | null
  prioridad: string | null
  sla_iniciado_en: string | null
  sla_pausado_desde: string | null
  sla_pausado_acumulado_seg: number | null
}

function setupMock(opts: {
  np: NP
  itemsNp?: { id: string }[]
  itemsOc?: { item_np_id: string; registro_compras_id: string }[]
  ocs?: { id: string; estado_oc: string }[]
  updateSpy?: jest.Mock
  insertSpy?: jest.Mock
}) {
  const { np, itemsNp = [], itemsOc = [], ocs = [], updateSpy, insertSpy } = opts

  mockFrom.mockImplementation((table: string) => {
    if (table === 'notas_pedido') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: np, error: null }) }) }),
        update: (payload: unknown) => {
          updateSpy?.(payload)
          return { eq: () => Promise.resolve({ data: {}, error: null }) }
        },
      }
    }
    if (table === 'items_np') {
      return { select: () => ({ eq: () => Promise.resolve({ data: itemsNp, error: null }) }) }
    }
    if (table === 'items_oc') {
      return { select: () => ({ in: () => Promise.resolve({ data: itemsOc, error: null }) }) }
    }
    if (table === 'registro_compras') {
      return { select: () => ({ in: () => Promise.resolve({ data: ocs, error: null }) }) }
    }
    if (table === 'historial_np') {
      return { insert: (payload: unknown) => { insertSpy?.(payload); return Promise.resolve({ data: {}, error: null }) } }
    }
    throw new Error(`tabla no mockeada: ${table}`)
  })
}

const npBase: NP = {
  id: 'np-1', estado: 'aprobada', asignado_a: null, prioridad: 'media',
  sla_iniciado_en: null, sla_pausado_desde: null, sla_pausado_acumulado_seg: 0,
}

describe('actualizarEstadoNP — RN-01 (solo estados autogestionados)', () => {
  it('no hace nada si el Estado actual no está en ESTADOS_AUTOGESTIONADOS (ej. borrador)', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, estado: 'borrador' }, updateSpy })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('no hace nada si el Estado actual es completada (RN-06, cierre administrativo)', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, estado: 'completada' }, updateSpy })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('actualizarEstadoNP — CA-03 (sin comprador asignado)', () => {
  it('permanece en aprobada si no hay asignado_a (no-op)', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, estado: 'aprobada', asignado_a: null }, updateSpy })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  // Spec: HU-010 CA-09, RN-04 — tomar_control no debe retroceder el Estado ni pausar el SLA
  it('permanece en en_gestion (no retrocede a aprobada) si queda sin comprador tras un tomar_control', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, estado: 'en_gestion', asignado_a: null }, updateSpy })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('permanece en oc_directa (no retrocede a aprobada) si queda sin comprador tras un tomar_control', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, estado: 'oc_directa', asignado_a: null, prioridad: 'excepcional' }, updateSpy })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('actualizarEstadoNP — CA-08 (Prioridad Excepcional → oc_directa)', () => {
  it('transiciona a oc_directa (no en_gestion) cuando Prioridad=excepcional y hay comprador', async () => {
    const updateSpy = jest.fn()
    const insertSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'aprobada', asignado_a: 'comprador-1', prioridad: 'excepcional' },
      itemsNp: [], updateSpy, insertSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'oc_directa' }))
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ np_id: 'np-1', estado: 'oc_directa' }))
  })

  it('activa el SLA (sla_iniciado_en) al entrar a oc_directa por primera vez', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'aprobada', asignado_a: 'comprador-1', prioridad: 'excepcional', sla_iniciado_en: null },
      itemsNp: [], updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ sla_iniciado_en: expect.any(String) }))
  })
})

describe('actualizarEstadoNP — CA-03 (Prioridad no excepcional → en_gestion)', () => {
  it('transiciona a en_gestion cuando hay comprador y aún no hay OC', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'aprobada', asignado_a: 'comprador-1', prioridad: 'media' },
      itemsNp: [{ id: 'item-1' }], itemsOc: [], updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'en_gestion' }))
  })
})

describe('actualizarEstadoNP — CA-03 (derivación por OC menos avanzada)', () => {
  it('todas las líneas cubiertas por OC en_proceso → oc_generada, pausa el SLA', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'en_gestion', asignado_a: 'comprador-1', prioridad: 'media' },
      itemsNp: [{ id: 'item-1' }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', estado_oc: 'en_proceso' }],
      updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'oc_generada',
      sla_pausado_desde: expect.any(String),
    }))
  })

  it('OC menos avanzada en_aprobacion_compras → oc_en_aprobacion', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'en_gestion', asignado_a: 'comprador-1', prioridad: 'media' },
      itemsNp: [{ id: 'item-1' }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', estado_oc: 'en_aprobacion_compras' }],
      updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'oc_en_aprobacion' }))
  })

  it('todas las OCs vivas en aprobada → oc_aprobada', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'oc_en_aprobacion', asignado_a: 'comprador-1', prioridad: 'media' },
      itemsNp: [{ id: 'item-1' }, { id: 'item-2' }],
      itemsOc: [
        { item_np_id: 'item-1', registro_compras_id: 'oc-1' },
        { item_np_id: 'item-2', registro_compras_id: 'oc-1' },
      ],
      ocs: [{ id: 'oc-1', estado_oc: 'aprobada' }],
      updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'oc_aprobada' }))
  })
})

describe('actualizarEstadoNP — RN-04 (OC rechazada/cancelada no cuenta)', () => {
  it('revierte de oc_generada a en_gestion cuando la única OC de una línea queda rechazada', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: {
        ...npBase, estado: 'oc_generada', asignado_a: 'comprador-1', prioridad: 'alta',
        sla_pausado_desde: new Date(Date.now() - 60_000).toISOString(), sla_iniciado_en: new Date().toISOString(),
      },
      itemsNp: [{ id: 'item-1' }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', estado_oc: 'rechazada' }], // ya no está en ESTADOS_OC_VIVOS
      updateSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'en_gestion' }))
  })

  it('reactiva el SLA (limpia sla_pausado_desde y acumula el tiempo pausado) al revertir', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: {
        ...npBase, estado: 'oc_generada', asignado_a: 'comprador-1', prioridad: 'alta',
        sla_pausado_desde: new Date(Date.now() - 60_000).toISOString(), sla_iniciado_en: new Date().toISOString(),
        sla_pausado_acumulado_seg: 10,
      },
      itemsNp: [{ id: 'item-1' }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', estado_oc: 'cancelada' }],
      updateSpy,
    })
    await actualizarEstadoNP('np-1')
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.sla_pausado_desde).toBeNull()
    expect(payload.sla_pausado_acumulado_seg).toBeGreaterThanOrEqual(10)
  })
})

describe('actualizarEstadoNP — no-op cuando el destino calculado es igual al actual', () => {
  it('no actualiza ni inserta historial si el Estado no cambia', async () => {
    const updateSpy = jest.fn()
    const insertSpy = jest.fn()
    setupMock({
      np: { ...npBase, estado: 'en_gestion', asignado_a: 'comprador-1', prioridad: 'media' },
      itemsNp: [{ id: 'item-1' }], itemsOc: [], updateSpy, insertSpy,
    })
    await actualizarEstadoNP('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe('pausarSLAPorCierre — CA-04, CA-09 (cierre administrativo por completada)', () => {
  it('es no-op si el SLA nunca inició (sla_iniciado_en null)', async () => {
    const updateSpy = jest.fn()
    setupMock({ np: { ...npBase, sla_iniciado_en: null }, updateSpy })
    await pausarSLAPorCierre('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('es no-op (idempotente) si el SLA ya está pausado', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, sla_iniciado_en: new Date().toISOString(), sla_pausado_desde: new Date().toISOString() },
      updateSpy,
    })
    await pausarSLAPorCierre('np-1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('pausa el SLA (setea sla_pausado_desde) si estaba activo y sin pausar', async () => {
    const updateSpy = jest.fn()
    setupMock({
      np: { ...npBase, sla_iniciado_en: new Date().toISOString(), sla_pausado_desde: null },
      updateSpy,
    })
    await pausarSLAPorCierre('np-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ sla_pausado_desde: expect.any(String) }))
  })
})
