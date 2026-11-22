// Spec: HU-042 — cubre las funciones puras de lib/bodega-guia.ts (saldo por guiar,
// motivo, validaciones, vigencia) y emitirGuia()/anularGuia() contra un mock de
// adminClient(), mismo patrón de bodega-egreso.test.ts.

const mockFrom = jest.fn()
const mockRpc = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom, rpc: mockRpc }))

jest.mock('@/lib/supabase/clients', () => ({ adminClient: () => mockAdminClient() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => Promise.resolve({ auth: { getUser: jest.fn() } })),
}))
jest.mock('@/lib/auditoria', () => ({ registrarAuditoria: jest.fn() }))

import {
  tipoAdmiteGuia, sugerirMotivo, calcularSaldoPorGuiar, formatNumeroGuia,
  validarLineasGuia, validarVigenciaGuia, validarDatosGuia, emitirGuia, anularGuia,
} from '@/lib/bodega-guia'

const ACTOR = { id: 'u1', nombre: 'Bodega Test', email: 'b@a.com', rol: 'bodega' }

function chainTabla(porTabla: Record<string, any>) {
  return (table: string) => {
    const result = porTabla[table] ?? { data: null, error: null }
    const obj: any = {}
    obj.select = () => obj
    obj.eq = () => obj
    obj.in = () => obj
    obj.insert = (payload: unknown) => {
      porTabla[table]?.onInsert?.(payload)
      return porTabla[table]?.insertResult ?? obj
    }
    obj.update = (payload: unknown) => {
      porTabla[table]?.onUpdate?.(payload)
      return obj
    }
    obj.single = () => Promise.resolve(result)
    obj.then = (resolve: any) => Promise.resolve(result).then(resolve)
    return obj
  }
}

const DATOS_OK = {
  punto_llegada: 'SHSN-216', motivo: 'venta', destinatario_nombre: 'SLB',
  transportista_nombre: 'Israel Chacha', transportista_identificacion: '2250106354', placa: 'pfq-2422',
}

describe('funciones puras — HU-042', () => {
  it('RN-03: solo venta/gasto/prestamo admiten guía', () => {
    expect(['venta', 'gasto', 'prestamo'].every(tipoAdmiteGuia)).toBe(true)
    expect(tipoAdmiteGuia('reconteo')).toBe(false)
    expect(tipoAdmiteGuia('ajuste_masivo')).toBe(false)
  })

  it('CA-12: motivo sugerido por tipo de egreso', () => {
    expect(sugerirMotivo('venta')).toBe('venta')
    expect(sugerirMotivo('prestamo')).toBe('renta')
    expect(sugerirMotivo('gasto')).toBe('otros')
  })

  it('CA-06: saldo por guiar nunca es negativo', () => {
    expect(calcularSaldoPorGuiar(10, 0)).toBe(10)
    expect(calcularSaldoPorGuiar(10, 4)).toBe(6)
    expect(calcularSaldoPorGuiar(10, 10)).toBe(0)
    expect(calcularSaldoPorGuiar(10, 12)).toBe(0)
  })

  it('CA-08: número con 7 dígitos como en el formato (0001822)', () => {
    expect(formatNumeroGuia(1822)).toBe('0001822')
  })

  describe('validarLineasGuia (CA-05/CA-06/RN-06)', () => {
    const saldos = new Map([['a', 5], ['b', 2]])
    it('ok dentro del saldo (incluye el límite exacto)', () => {
      expect(validarLineasGuia([{ egreso_item_id: 'a', cantidad: 5 }], saldos).ok).toBe(true)
    })
    it('400 sin líneas', () => {
      const r = validarLineasGuia([], saldos)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    })
    it('400 línea que no pertenece al egreso', () => {
      const r = validarLineasGuia([{ egreso_item_id: 'zzz', cantidad: 1 }], saldos)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.status).toBe(400); expect(r.excedidas).toEqual(['zzz']) }
    })
    it('400 cantidad 0 o negativa', () => {
      expect(validarLineasGuia([{ egreso_item_id: 'a', cantidad: 0 }], saldos).ok).toBe(false)
      expect(validarLineasGuia([{ egreso_item_id: 'a', cantidad: -1 }], saldos).ok).toBe(false)
    })
    it('409 supera el saldo (límite +1)', () => {
      const r = validarLineasGuia([{ egreso_item_id: 'b', cantidad: 3 }], saldos)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.status).toBe(409); expect(r.excedidas).toEqual(['b']) }
    })
  })

  describe('validarVigenciaGuia (CA-22)', () => {
    const ahora = new Date('2026-11-21T12:00:00Z')
    it('sin vigencia configurada no valida', () => expect(validarVigenciaGuia(null, ahora).ok).toBe(true))
    it('el último día de vigencia aún es válido', () => expect(validarVigenciaGuia('2026-11-21', ahora).ok).toBe(true))
    it('vencida un día después', () => expect(validarVigenciaGuia('2026-11-20', ahora).ok).toBe(false))
  })

  describe('validarDatosGuia (CA-09/10/11)', () => {
    it('datos completos → null', () => expect(validarDatosGuia(DATOS_OK)).toBeNull())
    it.each(['punto_llegada', 'destinatario_nombre', 'transportista_nombre', 'transportista_identificacion', 'placa'])(
      'falta %s', (campo) => {
        expect(validarDatosGuia({ ...DATOS_OK, [campo]: '  ' })).not.toBeNull()
      })
    it('motivo "otros" exige descripción', () => {
      expect(validarDatosGuia({ ...DATOS_OK, motivo: 'otros' })).not.toBeNull()
      expect(validarDatosGuia({ ...DATOS_OK, motivo: 'otros', motivo_otros: 'Calibración' })).toBeNull()
    })
    it('motivo fuera del catálogo se rechaza', () => {
      expect(validarDatosGuia({ ...DATOS_OK, motivo: 'regalo' })).not.toBeNull()
    })
  })
})

describe('emitirGuia — HU-042 CA-04/CA-05/CA-08/CA-19/CA-22', () => {
  const EGRESO = { id: 'e1', numero: 'EGR-2026-0001', estado: 'cerrado', tipo: 'venta', datos_traslado: null }
  const ITEMS = [
    { id: 'i1', producto_id: 'p1', cantidad: 10, requiere_guia: true },
    { id: 'i2', producto_id: 'p2', cantidad: 4, requiere_guia: false },
  ]
  const PRODUCTOS = [
    { id: 'p1', codigo: 'AL-I0759', descripcion: 'CABLE 18 AWG', unidad: 'M' },
    { id: 'p2', codigo: 'AL-C0014', descripcion: 'WAIPES', unidad: 'EA' },
  ]
  const CONFIG = { guia_serie: '001-001', guia_punto_partida_defecto: 'BASE ARLIFT', guia_numero_hasta: null, guia_vigencia_hasta: null }

  function montar(over: Record<string, any> = {}, onItems?: (p: any) => void, onGuia?: (p: any) => void) {
    mockRpc.mockResolvedValue({ data: 1822, error: null })
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: EGRESO, error: null },
      documentos_egreso_items: { data: ITEMS, error: null },
      configuracion_empresa: { data: CONFIG, error: null },
      inventario: { data: PRODUCTOS, error: null },
      guias_remision: {
        data: [], error: null, onInsert: onGuia,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'g1' }, error: null }) }) },
      },
      guias_remision_items: { data: [], error: null, onInsert: onItems },
      ...over,
    }))
  }

  beforeEach(() => { mockFrom.mockReset(); mockRpc.mockReset() })

  it('404 si el egreso no existe', async () => {
    montar({ documentos_egreso: { data: null, error: null } })
    const r = await emitirGuia('x', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })

  it('409 si el egreso no está cerrado (RN-02) y no consume número', async () => {
    montar({ documentos_egreso: { data: { ...EGRESO, estado: 'generado' }, error: null } })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each(['reconteo', 'ajuste_masivo'])('400 si el tipo %s no admite guía (RN-03)', async (tipo) => {
    montar({ documentos_egreso: { data: { ...EGRESO, tipo }, error: null } })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('emite con el siguiente número y solo con líneas que requieren guía, con snapshot', async () => {
    let items: any[] = []
    let guia: any = null
    montar({}, (p) => { items = p }, (p) => { guia = p })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.numero).toBe(1822)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ codigo: 'AL-I0759', descripcion: 'CABLE 18 AWG', unidad: 'M', cantidad: 10, linea: 1 })
    expect(guia).toMatchObject({ numero: 1822, serie: '001-001', placa: 'PFQ-2422', punto_partida: 'BASE ARLIFT' })
    expect(guia.fecha_fin_traslado).toBe(guia.fecha_inicio_traslado)
  })

  it('CA-12: sin motivo explícito usa el sugerido por el tipo de egreso (venta → venta)', async () => {
    let guia: any = null
    montar({}, undefined, (p) => { guia = p })
    const { motivo: _omitido, ...sinMotivo } = DATOS_OK
    const r = await emitirGuia('e1', sinMotivo, ACTOR)
    expect(r.ok).toBe(true)
    expect(guia.motivo).toBe('venta')
  })

  it('CA-19: no toca kardex_movimientos ni escribe en inventario', async () => {
    montar()
    await emitirGuia('e1', DATOS_OK, ACTOR)
    const tablas = mockFrom.mock.calls.map((c) => c[0])
    expect(tablas).not.toContain('kardex_movimientos')
  })

  it('usa el borrador del egreso cuando el input no trae datos (CA-04b/CA-04c)', async () => {
    montar({ documentos_egreso: { data: { ...EGRESO, datos_traslado: DATOS_OK }, error: null } })
    const r = await emitirGuia('e1', {}, ACTOR)
    expect(r.ok).toBe(true)
  })

  it('409 si una línea explícita supera el saldo (CA-06)', async () => {
    montar()
    const r = await emitirGuia('e1', { ...DATOS_OK, lineas: [{ egreso_item_id: 'i1', cantidad: 11 }] }, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('descuenta lo ya guiado en guías vigentes (varios viajes)', async () => {
    montar({
      guias_remision: {
        data: [{ id: 'gPrev' }], error: null,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'g2' }, error: null }) }) },
      },
      guias_remision_items: { data: [{ egreso_item_id: 'i1', cantidad: 6 }], error: null },
    })
    const r = await emitirGuia('e1', { ...DATOS_OK, lineas: [{ egreso_item_id: 'i1', cantidad: 5 }] }, ACTOR)
    expect(r.ok).toBe(false) // saldo restante = 4
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('409 con autorización vencida, sin consumir número (CA-22)', async () => {
    montar({ configuracion_empresa: { data: { ...CONFIG, guia_vigencia_hasta: '2020-01-01' }, error: null } })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('409 si el rango autorizado está agotado (CA-22)', async () => {
    montar()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'GUIA_RANGO_AGOTADO' } })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('si fallan las líneas, la guía queda anulada con motivo (RN-04)', async () => {
    let actualizado: any = null
    montar({
      guias_remision: {
        data: [], error: null, onUpdate: (p: any) => { actualizado = p },
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'g1' }, error: null }) }) },
      },
      guias_remision_items: { data: null, error: null, insertResult: Promise.resolve({ error: { message: 'boom' } }) },
    })
    const r = await emitirGuia('e1', DATOS_OK, ACTOR)
    expect(r.ok).toBe(false)
    expect(actualizado).toMatchObject({ estado: 'anulada' })
  })
})

describe('emitirGuia — identificadores opcionales de catálogo (defecto real hallado en la validación de UI)', () => {
  const EGRESO = { id: 'e1', numero: 'EGR-2026-0001', estado: 'cerrado', tipo: 'venta', datos_traslado: null }
  const ITEMS = [{ id: 'i1', producto_id: 'p1', cantidad: 5, requiere_guia: true }]
  const PRODUCTOS = [{ id: 'p1', codigo: 'AL-I0759', descripcion: 'CABLE', unidad: 'M' }]
  const UUID_OK = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34'

  function montar(extra: Record<string, any> = {}, onGuia?: (p: any) => void) {
    mockRpc.mockResolvedValue({ data: 1822, error: null })
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: EGRESO, error: null },
      documentos_egreso_items: { data: ITEMS, error: null },
      configuracion_empresa: { data: { guia_serie: '001-001', guia_punto_partida_defecto: 'BASE ARLIFT', guia_numero_hasta: null, guia_vigencia_hasta: null }, error: null },
      inventario: { data: PRODUCTOS, error: null },
      guias_remision: {
        data: [], error: null, onInsert: onGuia,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'g1' }, error: null }) }) },
      },
      guias_remision_items: { data: [], error: null },
      ...extra,
    }))
  }
  beforeEach(() => { mockFrom.mockReset(); mockRpc.mockReset() })

  it("'' en cliente/lugar/transportista se guarda como NULL (antes rompía el INSERT con 500)", async () => {
    let guia: any = null
    montar({}, (p) => { guia = p })
    const r = await emitirGuia('e1', { ...DATOS_OK, cliente_final_id: '', punto_entrega_id: '  ', transportista_id: '' }, ACTOR)
    expect(r.ok).toBe(true)
    expect(guia.cliente_final_id).toBeNull()
    expect(guia.punto_entrega_id).toBeNull()
    expect(guia.transportista_id).toBeNull()
  })

  it('un identificador con formato inválido se rechaza con 400 SIN consumir número', async () => {
    montar()
    const r = await emitirGuia('e1', { ...DATOS_OK, cliente_final_id: 'no-es-uuid' }, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('un identificador que no existe en el catálogo se rechaza con 400 SIN consumir número', async () => {
    montar({ transportistas: { data: null, error: null } })
    const r = await emitirGuia('e1', { ...DATOS_OK, transportista_id: UUID_OK }, ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.status).toBe(400); expect(r.error).toMatch(/transportista/i) }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('un identificador válido y existente se conserva en la guía', async () => {
    let guia: any = null
    montar({ clientes_finales: { data: { id: UUID_OK }, error: null } }, (p) => { guia = p })
    const r = await emitirGuia('e1', { ...DATOS_OK, cliente_final_id: UUID_OK }, ACTOR)
    expect(r.ok).toBe(true)
    expect(guia.cliente_final_id).toBe(UUID_OK)
  })
})

describe('anularGuia — HU-042 CA-16/CA-17', () => {
  beforeEach(() => mockFrom.mockReset())

  it('400 sin motivo', async () => {
    const r = await anularGuia('g1', '  ', ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })
  it('404 si no existe', async () => {
    mockFrom.mockImplementation(chainTabla({ guias_remision: { data: null, error: null } }))
    const r = await anularGuia('g1', 'error de digitación', ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })
  it('409 si ya está anulada', async () => {
    mockFrom.mockImplementation(chainTabla({ guias_remision: { data: { id: 'g1', numero: 1822, estado: 'anulada' }, error: null } }))
    const r = await anularGuia('g1', 'x', ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })
  it('anula con motivo y deja trazabilidad', async () => {
    let upd: any = null
    mockFrom.mockImplementation(chainTabla({
      guias_remision: { data: { id: 'g1', numero: 1822, estado: 'emitida' }, error: null, onUpdate: (p: any) => { upd = p } },
    }))
    const r = await anularGuia('g1', 'Placa incorrecta', ACTOR)
    expect(r.ok).toBe(true)
    expect(upd).toMatchObject({ estado: 'anulada', motivo_anulacion: 'Placa incorrecta', anulada_por_id: 'u1' })
  })
})
