// Spec: HU-031 — cubre verificarAutorizacionEnsamblaje(), crearOrdenEnsamblaje()
// y confirmarOrdenEnsamblaje() directamente contra un mock de
// adminClient()/createSupabaseServerClient(), mismo patrón de bodega-egreso.test.ts.

const mockFrom = jest.fn()
const mockRpc = jest.fn(() => Promise.resolve({ data: 1, error: null }))
const mockAdminClient = jest.fn(() => ({ from: mockFrom, rpc: mockRpc }))
const mockGetUser = jest.fn()

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}))
jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

// Spec: HU-046 — generarCorreccionCostoCeroSiAplica() es cross-module desde
// la perspectiva de bodega-ensamblaje.ts (vive en bodega-ingreso.ts) — se
// mockea limpiamente, sus internos ya están cubiertos en
// bodega-ingreso.test.ts (mismo criterio que bodega-reemplazo-inventario.test.ts
// reutiliza el motor de Kardex sin reimplementarlo).
const mockGenerarCorreccion = jest.fn()
jest.mock('@/lib/bodega-ingreso', () => ({
  generarCorreccionCostoCeroSiAplica: (...args: unknown[]) => mockGenerarCorreccion(...args),
}))

import {
  verificarAutorizacionEnsamblaje,
  crearOrdenEnsamblaje,
  confirmarOrdenEnsamblaje,
} from '@/lib/bodega-ensamblaje'

const ACTOR = { id: 'user-1', nombre: 'Bodega Test', email: 'bodega@arlift.com', rol: 'bodega' }

function chainTabla(porTabla: Record<string, any>) {
  return (table: string) => {
    const result = porTabla[table] ?? { data: null, error: null }
    const obj: any = {}
    obj.select = () => obj
    obj.eq     = () => obj
    obj.in     = () => obj
    obj.delete = () => obj
    obj.insert = (payload: unknown) => {
      if (porTabla[table]?.onInsert) porTabla[table].onInsert(payload)
      return porTabla[table]?.insertResult ?? obj
    }
    obj.update = (payload: unknown) => {
      if (porTabla[table]?.onUpdate) porTabla[table].onUpdate(payload)
      return obj
    }
    obj.single = () => Promise.resolve(result)
    obj.maybeSingle = () => Promise.resolve(result)
    obj.then = (resolve: any) => Promise.resolve(result).then(resolve)
    return obj
  }
}

// Spec: HU-046 CA-09 — el mock genérico de 'inventario' arriba devuelve el
// MISMO array estático sin importar si la consulta real es `.in()` (bulk,
// validación previa de insumos+resultados) o `.eq('id',x).single()` (lectura
// fresca por línea, nueva en esta HU). Este resolver distingue ambas formas
// y mantiene estado real entre lecturas/escrituras — necesario porque
// confirmarOrdenEnsamblaje() ahora lee el producto resultante en vivo línea
// por línea, en vez de un mapa armado una sola vez antes del loop.
function chainInventarioDinamico(filasIniciales: { id: string; codigo?: string; saldo_existencias: number; costo_unitario: number }[]) {
  const estado = new Map(filasIniciales.map((f) => [f.id, { ...f }]))
  return (table: string) => {
    if (table !== 'inventario') return undefined as never
    let filtroId: string | null = null
    let updatePendiente: Record<string, unknown> | null = null
    const obj: any = {}
    obj.select = () => obj
    // Spec: el patrón real siempre encadena .update(payload).eq('id', x) —
    // update() llega ANTES que eq(); se guarda y se aplica recién cuando eq()
    // finalmente fija el id (nunca al revés, nunca con .eq() antes).
    obj.eq = (_col: string, val: string) => {
      filtroId = val
      if (updatePendiente) {
        estado.set(val, { ...(estado.get(val) as any), ...updatePendiente })
        updatePendiente = null
      }
      return obj
    }
    obj.in = () => obj
    obj.update = (payload: Record<string, unknown>) => { updatePendiente = payload; return obj }
    obj.single = () => Promise.resolve({ data: filtroId ? (estado.get(filtroId) ?? null) : null, error: null })
    obj.maybeSingle = () => obj.single()
    obj.then = (resolve: any) => Promise.resolve({ data: [...estado.values()], error: null }).then(resolve)
    return obj
  }
}

function conInventarioDinamico(
  porTabla: Record<string, any>,
  filasInventario: { id: string; codigo?: string; saldo_existencias: number; costo_unitario: number }[]
) {
  const inventarioChain = chainInventarioDinamico(filasInventario)
  const otras = chainTabla(porTabla)
  return (table: string) => (table === 'inventario' ? inventarioChain(table) : otras(table))
}

// Spec: HU-046 — default seguro para todos los tests existentes (ninguno de
// ellos ejercita la corrección de costo cero a propósito); los tests nuevos
// de HU-046 lo sobreescriben explícitamente.
beforeEach(() => {
  mockGenerarCorreccion.mockReset()
  mockGenerarCorreccion.mockResolvedValue({ corregido: false })
})

describe('verificarAutorizacionEnsamblaje', () => {
  it('401 sin sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const auth = await verificarAutorizacionEnsamblaje()
    expect(auth.ok).toBe(false)
  })

  it('403 con rol asistente_compras (mismo criterio que Egresos)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol: 'asistente_compras', nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionEnsamblaje()
    expect(auth.ok).toBe(false)
  })

  it.each(['bodega', 'compras', 'admin'])('200 con rol %s', async (rol) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol, nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionEnsamblaje()
    expect(auth.ok).toBe(true)
  })
})

describe('crearOrdenEnsamblaje — CA-01', () => {
  it('rechaza sin insumos', async () => {
    const resultado = await crearOrdenEnsamblaje({ bodegaId: 'bod-1', insumos: [], resultados: [{ producto_id: 'p1', cantidad: 1 }] }, ACTOR)
    expect(resultado.ok).toBe(false)
  })

  it('rechaza sin resultados', async () => {
    const resultado = await crearOrdenEnsamblaje({ bodegaId: 'bod-1', insumos: [{ producto_id: 'p1', cantidad: 1 }], resultados: [] }, ACTOR)
    expect(resultado.ok).toBe(false)
  })

  it('crea la orden con insumos y resultados reales', async () => {
    const insumosSpy = jest.fn()
    const resultadosSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      ordenes_ensamblaje: {
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'fb-1', numero: 'FB-2026-0001' }, error: null }) }) },
      },
      ordenes_ensamblaje_insumos: { onInsert: insumosSpy, data: null, error: null },
      ordenes_ensamblaje_resultados: { onInsert: resultadosSpy, data: null, error: null },
    }))
    const resultado = await crearOrdenEnsamblaje(
      { bodegaId: 'bod-1', insumos: [{ producto_id: 'p1', cantidad: 10 }], resultados: [{ producto_id: 'p2', cantidad: 1 }] },
      ACTOR
    )
    expect(resultado).toEqual({ ok: true, ordenId: 'fb-1', numero: 'FB-2026-0001' })
    expect(insumosSpy).toHaveBeenCalledWith([expect.objectContaining({ producto_id: 'p1', cantidad: 10 })])
    expect(resultadosSpy).toHaveBeenCalledWith([expect.objectContaining({ producto_id: 'p2', cantidad: 1 })])
  })
})

describe('confirmarOrdenEnsamblaje — CA-02/CA-03/CA-04', () => {
  it('bloquea con saldo insuficiente de un insumo', async () => {
    mockFrom.mockImplementation(chainTabla({
      ordenes_ensamblaje: { data: { id: 'fb-1', numero: 'FB-2026-0001', estado: 'generada', bodega_id: 'bod-1' }, error: null },
      ordenes_ensamblaje_insumos: { data: [{ id: 'i1', producto_id: 'insumo-1', cantidad: 50 }], error: null },
      ordenes_ensamblaje_resultados: { data: [{ id: 'r1', producto_id: 'result-1', cantidad: 1 }], error: null },
      inventario: {
        data: [
          { id: 'insumo-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 5 },
          { id: 'result-1', codigo: 'AL-I0002', saldo_existencias: 0, costo_unitario: 0 },
        ],
        error: null,
      },
    }))
    const resultado = await confirmarOrdenEnsamblaje('fb-1', ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.insumosExcedidos).toEqual(['AL-I0001'])
  })

  it('confirma: costea el resultado como suma de insumos, genera Kardex de salida y entrada (CA-04)', async () => {
    const kardexInsertSpy = jest.fn()
    const ordenUpdateSpy = jest.fn()
    mockFrom.mockImplementation(conInventarioDinamico({
      ordenes_ensamblaje: {
        data: { id: 'fb-1', numero: 'FB-2026-0001', estado: 'generada', bodega_id: 'bod-1' },
        error: null, onUpdate: ordenUpdateSpy,
      },
      ordenes_ensamblaje_insumos: {
        data: [
          { id: 'i1', producto_id: 'insumo-1', cantidad: 2 },
          { id: 'i2', producto_id: 'insumo-2', cantidad: 3 },
        ],
        error: null,
      },
      ordenes_ensamblaje_resultados: { data: [{ id: 'r1', producto_id: 'result-1', cantidad: 1 }], error: null },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
    }, [
      { id: 'insumo-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 10 },
      { id: 'insumo-2', codigo: 'AL-I0002', saldo_existencias: 10, costo_unitario: 20 },
      { id: 'result-1', codigo: 'AL-I0003', saldo_existencias: 0, costo_unitario: 0 },
    ]))

    // costoInsumosTotal = 2*10 + 3*20 = 80; costoPorUnidadResultado = 80/1 = 80
    const resultado = await confirmarOrdenEnsamblaje('fb-1', ACTOR)
    expect(resultado.ok).toBe(true)

    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      producto_id: 'insumo-1', direccion: 'salida', tipo: 'field_build', saldo_resultante: 8,
    }))
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      producto_id: 'insumo-2', direccion: 'salida', tipo: 'field_build', saldo_resultante: 7,
    }))
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      producto_id: 'result-1', direccion: 'entrada', tipo: 'field_build',
      costo_unitario: 80, costo_promedio_resultante: 80, saldo_resultante: 1,
    }))
    expect(ordenUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'confirmada' }))
  })

  it('bloquea si ya está confirmada', async () => {
    mockFrom.mockImplementation(chainTabla({
      ordenes_ensamblaje: { data: { id: 'fb-1', numero: 'FB-2026-0001', estado: 'confirmada' }, error: null },
    }))
    const resultado = await confirmarOrdenEnsamblaje('fb-1', ACTOR)
    expect(resultado.ok).toBe(false)
  })

  // Spec: HU-046 CA-03/CA-09 — el producto resultante en costo cero dispara
  // la corrección antes de promediar; el mock de generarCorreccionCostoCeroSiAplica
  // simula que YA corrigió (como si el par de documentos ya se hubiera
  // generado y cerrado) actualizando directamente el estado del inventario
  // dinámico — exactamente lo que la función real haría por su cuenta.
  it('HU-046 CA-03: producto resultante en costo cero dispara la corrección antes de promediar', async () => {
    const kardexInsertSpy = jest.fn()
    const inventarioDinamico = conInventarioDinamico(
      {
        ordenes_ensamblaje: { data: { id: 'fb-2', numero: 'FB-2026-0002', estado: 'generada', bodega_id: 'bod-1' }, error: null },
        ordenes_ensamblaje_insumos: { data: [{ id: 'i1', producto_id: 'insumo-1', cantidad: 2 }], error: null },
        ordenes_ensamblaje_resultados: { data: [{ id: 'r1', producto_id: 'result-1', cantidad: 1 }], error: null },
        kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      },
      [
        { id: 'insumo-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 40 },
        // result-1 está "atascado" en costo cero con saldo real > 0.
        { id: 'result-1', codigo: 'AL-I0003', saldo_existencias: 20, costo_unitario: 0 },
      ]
    )
    mockFrom.mockImplementation(inventarioDinamico)

    mockGenerarCorreccion.mockImplementation(async (params: any) => {
      // Simula el efecto real: el producto queda a saldo original, costo ya
      // corregido (el nuevo saldo sigue siendo el mismo, solo cambia costo).
      await mockFrom('inventario').update({ costo_unitario: params.costoReal }).eq('id', params.productoId).single()
      return { corregido: true, ingresoNumero: 'ING-2026-0099', egresoNumero: 'EGR-2026-0050' }
    })

    // costoInsumosTotal = 2*40 = 80; costoPorUnidadResultado = 80/1 = 80
    const resultado = await confirmarOrdenEnsamblaje('fb-2', ACTOR)
    expect(resultado.ok).toBe(true)

    expect(mockGenerarCorreccion).toHaveBeenCalledWith(expect.objectContaining({
      productoId: 'result-1', saldoActual: 20, costoActual: 0, costoReal: 80,
      bodegaId: 'bod-1', referenciaDisparador: 'Ensamblaje FB-2026-0002',
    }))
    // Tras la corrección simulada (saldo=20, costo=80), el promedio con la
    // entrada real de 1 unidad a 80 debe seguir dando 80 exacto — NUNCA el
    // valor diluido que daría promediar contra el costo 0 original.
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      producto_id: 'result-1', direccion: 'entrada', costo_unitario: 80,
      costo_promedio_resultante: 80, saldo_resultante: 21,
    }))
  })
})
