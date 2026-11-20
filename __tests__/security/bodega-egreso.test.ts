// Spec: HU-030 — cubre verificarAutorizacionEgreso(), crearDocumentoEgreso(),
// cerrarDocumentoEgreso() y listarPrestamosPendientes() directamente contra
// un mock de adminClient()/createSupabaseServerClient(), mismo patrón ya
// usado en bodega-ingreso.test.ts.

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

import {
  verificarAutorizacionEgreso,
  crearDocumentoEgreso,
  cerrarDocumentoEgreso,
  listarPrestamosPendientes,
} from '@/lib/bodega-egreso'

const ACTOR = { id: 'user-1', nombre: 'Bodega Test', email: 'bodega@arlift.com', rol: 'bodega' }
const ACTOR_ADMIN = { id: 'user-2', nombre: 'Admin Test', email: 'admin@arlift.com', rol: 'admin' }

function chainTabla(porTabla: Record<string, any>) {
  return (table: string) => {
    const result = porTabla[table] ?? { data: null, error: null }
    const obj: any = {}
    obj.select = () => obj
    obj.eq     = () => obj
    obj.in     = () => obj
    obj.not    = () => obj
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

describe('verificarAutorizacionEgreso', () => {
  it('401 sin sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const auth = await verificarAutorizacionEgreso()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.status).toBe(401)
  })

  it('403 con rol sin permiso (gerencia)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol: 'gerencia', nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionEgreso()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.status).toBe(403)
  })

  it('403 con rol asistente_compras (HU-030 CA-01: no participa, a diferencia de HU-028)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol: 'asistente_compras', nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionEgreso()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.status).toBe(403)
  })

  it.each(['bodega', 'compras', 'admin'])('200 con rol %s (CA-01)', async (rol) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol, nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionEgreso()
    expect(auth.ok).toBe(true)
  })
})

describe('crearDocumentoEgreso — CA-01', () => {
  it('rechaza tipo inválido', async () => {
    const resultado = await crearDocumentoEgreso(
      { tipo: 'compra' as any, bodegaId: 'bod-1', lineas: [{ producto_id: 'p1', cantidad: 1 }] },
      ACTOR
    )
    expect(resultado.ok).toBe(false)
  })

  it('rechaza sin bodega_id', async () => {
    const resultado = await crearDocumentoEgreso(
      { tipo: 'venta', bodegaId: '', lineas: [{ producto_id: 'p1', cantidad: 1 }] },
      ACTOR
    )
    expect(resultado.ok).toBe(false)
  })

  it('rechaza una línea sin producto_id', async () => {
    const resultado = await crearDocumentoEgreso(
      { tipo: 'gasto', bodegaId: 'bod-1', lineas: [{ producto_id: '', cantidad: 1 }] },
      ACTOR
    )
    expect(resultado.ok).toBe(false)
  })

  it('ignora cliente_final_id/pozo_id en tipo prestamo (no los usa, CA-01)', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: {
        onInsert: insertSpy,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-1', numero: 'EGR-2026-0001' }, error: null }) }) },
      },
      documentos_egreso_items: { data: null, error: null },
    }))
    await crearDocumentoEgreso(
      { tipo: 'prestamo', bodegaId: 'bod-1', clienteFinalId: 'cliente-1', pozoId: 'pozo-1', lineas: [{ producto_id: 'p1', cantidad: 1 }] },
      ACTOR
    )
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ cliente_final_id: null, pozo_id: null }))
  })

  it('persiste cliente_final_id/pozo_id en tipo venta', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: {
        onInsert: insertSpy,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-2', numero: 'EGR-2026-0002' }, error: null }) }) },
      },
      documentos_egreso_items: { data: null, error: null },
    }))
    const resultado = await crearDocumentoEgreso(
      { tipo: 'venta', bodegaId: 'bod-1', clienteFinalId: 'cliente-1', pozoId: 'pozo-1', lineas: [{ producto_id: 'p1', cantidad: 1 }] },
      ACTOR
    )
    expect(resultado).toEqual({ ok: true, documentoId: 'doc-2', numero: 'EGR-2026-0002' })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ cliente_final_id: 'cliente-1', pozo_id: 'pozo-1' }))
  })
})

describe('cerrarDocumentoEgreso — CA-02/CA-03/CA-06', () => {
  it('bloquea con saldo insuficiente, sin override', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: { id: 'doc-1', numero: 'EGR-2026-0001', estado: 'generado', tipo: 'venta', bodega_id: 'bod-1' }, error: null },
      documentos_egreso_items: { data: [{ id: 'l1', producto_id: 'prod-1', cantidad: 50 }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 5 }], error: null },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.lineasExcedidas).toEqual(['AL-I0001'])
  })

  it('bloquea el override si quien cierra no es admin', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: { id: 'doc-1', numero: 'EGR-2026-0001', estado: 'generado', tipo: 'venta', bodega_id: 'bod-1' }, error: null },
      documentos_egreso_items: { data: [{ id: 'l1', producto_id: 'prod-1', cantidad: 50 }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 5 }], error: null },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-1', ACTOR, { override: true, justificacion: 'forzado' })
    expect(resultado.ok).toBe(false)
  })

  it('cierra correctamente con override de admin cuando el saldo no alcanza', async () => {
    const kardexInsertSpy = jest.fn()
    const docUpdateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: {
        data: { id: 'doc-1', numero: 'EGR-2026-0001', estado: 'generado', tipo: 'venta', bodega_id: 'bod-1' },
        error: null, onUpdate: docUpdateSpy,
      },
      documentos_egreso_items: { data: [{ id: 'l1', producto_id: 'prod-1', cantidad: 50 }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 5 }], error: null },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-1', ACTOR_ADMIN, { override: true, justificacion: 'autorizado por gerencia' })
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ direccion: 'salida', tipo: 'venta', saldo_resultante: -40 })
    )
    expect(docUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ override_admin: true, justificacion_override: 'autorizado por gerencia' }))
  })

  it('cierra correctamente sin tocar el promedio ponderado (RN-BOD-07)', async () => {
    const kardexInsertSpy = jest.fn()
    const inventarioUpdateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: { id: 'doc-1', numero: 'EGR-2026-0001', estado: 'generado', tipo: 'reconteo', bodega_id: 'bod-1' }, error: null },
      documentos_egreso_items: { data: [{ id: 'l1', producto_id: 'prod-1', cantidad: 10 }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', saldo_existencias: 100, costo_unitario: 12 }], error: null, onUpdate: inventarioUpdateSpy },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ costo_unitario: 12, costo_promedio_resultante: 12, saldo_resultante: 90, bodega_id: 'bod-1' })
    )
    // Spec: HU-034 CA-03 — tipo='reconteo' también actualiza ultimo_conteo_fecha.
    expect(inventarioUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ saldo_existencias: 90, ultimo_conteo_fecha: expect.any(String) }))
  })

  it('HU-034 CA-03: cerrar un Egreso tipo venta NO toca ultimo_conteo_fecha', async () => {
    const inventarioUpdateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: { id: 'doc-2', numero: 'EGR-2026-0002', estado: 'generado', tipo: 'venta', bodega_id: 'bod-1' }, error: null },
      documentos_egreso_items: { data: [{ id: 'l1', producto_id: 'prod-1', cantidad: 5 }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', saldo_existencias: 100, costo_unitario: 12 }], error: null, onUpdate: inventarioUpdateSpy },
      kardex_movimientos: { data: [], error: null },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-2', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(inventarioUpdateSpy).toHaveBeenCalledWith(expect.not.objectContaining({ ultimo_conteo_fecha: expect.anything() }))
  })

  it('bloquea si ya está cerrado', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: { data: { id: 'doc-1', numero: 'EGR-2026-0001', estado: 'cerrado' }, error: null },
    }))
    const resultado = await cerrarDocumentoEgreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(false)
  })
})

describe('listarPrestamosPendientes — CA-05', () => {
  it('excluye un préstamo ya referenciado por una Devolución cerrada', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_egreso: {
        data: [
          { id: 'egr-1', numero: 'EGR-2026-0001', bodega_id: 'bod-1', cerrado_en: '2026-01-01' },
          { id: 'egr-2', numero: 'EGR-2026-0002', bodega_id: 'bod-1', cerrado_en: '2026-01-02' },
        ],
        error: null,
      },
      documentos_ingreso: { data: [{ egreso_prestamo_id: 'egr-1' }], error: null },
    }))
    const pendientes = await listarPrestamosPendientes()
    expect(pendientes.map((p) => p.id)).toEqual(['egr-2'])
  })
})
