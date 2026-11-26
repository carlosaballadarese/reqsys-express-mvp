// Spec: HU-028 — cubre generarDocumentoIngresoDesdeOC(), cerrarDocumentoIngreso()
// y resolverCancelacionIngresoPorOC() directamente contra un mock de
// adminClient()/createSupabaseServerClient() (sin pasar por HTTP), mismo
// patrón ya usado en oca-estado.test.ts/np-estado-actualizar.test.ts.

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

// Spec: HU-046 — crearDocumentoEgresoMasivo/cerrarDocumentoEgreso son
// cross-module (bodega-egreso.ts), mockeables limpiamente. El lado de
// Ingreso (crearDocumentoIngresoMasivo/cerrarDocumentoIngreso) es same-module
// con generarCorreccionCostoCeroSiAplica — no mockeable sin romper el propio
// objeto bajo prueba, así que corre real contra el mock de Supabase
// (chainTabla) en los tests de la ruta feliz, mismo criterio ya usado en
// bodega-reemplazo-inventario.test.ts para no reimplementar el motor.
const mockCrearDocumentoEgresoMasivo = jest.fn()
const mockCerrarDocumentoEgreso = jest.fn()
jest.mock('@/lib/bodega-egreso', () => ({
  crearDocumentoEgresoMasivo: (...args: unknown[]) => mockCrearDocumentoEgresoMasivo(...args),
  cerrarDocumentoEgreso: (...args: unknown[]) => mockCerrarDocumentoEgreso(...args),
}))

import {
  generarDocumentoIngresoDesdeOC,
  cerrarDocumentoIngreso,
  resolverCancelacionIngresoPorOC,
  verificarAutorizacionIngreso,
  crearDocumentoIngresoManual,
  generarCorreccionCostoCeroSiAplica,
} from '@/lib/bodega-ingreso'

const ACTOR = { id: 'user-1', nombre: 'Bodega Test', email: 'bodega@arlift.com', rol: 'bodega' }

function chainTabla(porTabla: Record<string, any>) {
  return (table: string) => {
    const result = porTabla[table] ?? { data: null, error: null }
    const obj: any = {}
    obj.select = () => obj
    obj.eq     = () => obj
    obj.in     = () => obj
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

describe('verificarAutorizacionIngreso', () => {
  it('401 sin sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const auth = await verificarAutorizacionIngreso()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.status).toBe(401)
  })

  it('403 con rol sin permiso (gerencia)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol: 'gerencia', nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionIngreso()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.status).toBe(403)
  })

  it.each(['bodega', 'asistente_compras', 'compras', 'admin'])('200 con rol %s (CA-03)', async (rol) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(chainTabla({ perfiles: { data: { rol, nombre: 'X', email: 'x@a.com' }, error: null } }))
    const auth = await verificarAutorizacionIngreso()
    expect(auth.ok).toBe(true)
  })
})

describe('generarDocumentoIngresoDesdeOC — CA-01/CA-01b', () => {
  it('no genera documento si todos los ítems son SERVICIOS', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ codigo: 'X1', descripcion: 'Mano de obra', cantidad: 1, precio_unitario: 100, tipo: 'SERVICIOS' }], error: null },
    }))
    const resultado = await generarDocumentoIngresoDesdeOC('oc-1', ACTOR)
    expect(resultado).toBeNull()
  })

  it('genera línea con producto_id resuelto cuando el código matchea inventario real', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'item-oc-1', codigo: 'AL-I0001', descripcion: 'Válvula', cantidad: 5, precio_unitario: 20, tipo: 'BIENES' }], error: null },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001', bodega_id: 'bod-1' }], error: null },
      documentos_ingreso: {
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-1', numero: 'ING-2026-0001' }, error: null }) }) },
      },
      documentos_ingreso_items: { onInsert: insertSpy, data: null, error: null },
    }))

    const resultado = await generarDocumentoIngresoDesdeOC('oc-1', ACTOR)
    expect(resultado).toEqual({ documentoId: 'doc-1', numero: 'ING-2026-0001' })
    expect(insertSpy).toHaveBeenCalledWith([
      // Spec: HU-047 CA-01 — item_oc_id real, además del snapshot de texto ya existente.
      expect.objectContaining({ item_oc_id: 'item-oc-1', producto_id: 'prod-1', codigo_oc: 'AL-I0001', cantidad: 5, costo_unitario: 20 }),
    ])
  })

  it('genera línea con producto_id NULL cuando el código no matchea ningún producto real (CA-01b)', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'item-oc-2', codigo: 'NO-EXISTE', descripcion: 'Ítem sin catálogo', cantidad: 2, precio_unitario: 10, tipo: 'BIENES' }], error: null },
      inventario: { data: [], error: null },
      documentos_ingreso: {
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-2', numero: 'ING-2026-0002' }, error: null }) }) },
      },
      documentos_ingreso_items: { onInsert: insertSpy, data: null, error: null },
    }))

    await generarDocumentoIngresoDesdeOC('oc-1', ACTOR)
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({ item_oc_id: 'item-oc-2', producto_id: null, codigo_oc: 'NO-EXISTE' }),
    ])
  })
})

describe('cerrarDocumentoIngreso — CA-04/CA-05/CA-06', () => {
  it('bloquea si ya está cerrado', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'cerrado', bodega_id: 'bod-1' }, error: null },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(false)
  })

  it('bloquea con líneas inválidas: sin producto vinculado, cantidad 0, sin costo (CA-05)', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: 'bod-1' }, error: null },
      documentos_ingreso_items: {
        data: [
          { id: 'l1', producto_id: null, descripcion_oc: 'Sin producto', cantidad: 5, costo_unitario: 10 },
          { id: 'l2', producto_id: 'prod-1', descripcion_oc: 'Cantidad 0', cantidad: 0, costo_unitario: 10 },
        ],
        error: null,
      },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.lineasInvalidas).toEqual(['Sin producto', 'Cantidad 0'])
    }
  })

  it('cierra correctamente: genera Kardex con el promedio ponderado exacto (CA-06)', async () => {
    const kardexInsertSpy = jest.fn()
    const inventarioUpdateSpy = jest.fn()
    const docUpdateSpy = jest.fn()

    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'compra' },
        error: null,
        onUpdate: docUpdateSpy,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Válvula', cantidad: 50, costo_unitario: 16 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      inventario: {
        data: { saldo_existencias: 100, costo_unitario: 10 },
        error: null,
        onUpdate: inventarioUpdateSpy,
      },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        producto_id: 'prod-1', direccion: 'entrada', tipo: 'compra',
        cantidad: 50, costo_unitario: 16, saldo_resultante: 150, costo_promedio_resultante: 12,
      })
    )
    expect(inventarioUpdateSpy).toHaveBeenCalledWith({ saldo_existencias: 150, costo_unitario: 12 })
    expect(docUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'cerrado' }))
  })

  // Spec: HU-041 RN-04/RN-05/RN-07
  it('ajuste_masivo: el costo resultante es el del archivo directo, sin promediar (RN-04)', async () => {
    const kardexInsertSpy = jest.fn()
    const inventarioUpdateSpy = jest.fn()

    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: null, tipo_movimiento: 'ajuste_masivo' },
        error: null,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Ajuste masivo', cantidad: 20, costo_unitario: 7.5 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      inventario: { data: { saldo_existencias: 100, costo_unitario: 10 }, error: null, onUpdate: inventarioUpdateSpy },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(true)
    // saldo 100+10*10=100 tras promedio normal sería distinto a 7.5; aquí
    // debe quedar EXACTAMENTE 7.5 (el costo del archivo), no mezclado.
    expect(kardexInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ajuste_masivo', cantidad: 20, saldo_resultante: 120, costo_promedio_resultante: 7.5 })
    )
    expect(inventarioUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ saldo_existencias: 120, costo_unitario: 7.5, ultimo_conteo_fecha: expect.any(String) })
    )
  })

  it('ajuste_masivo: admite cantidad=0 (ajuste de solo-costo, RN-05) — reconteo/compra lo rechazan', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: null, tipo_movimiento: 'ajuste_masivo' },
        error: null,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Solo costo', cantidad: 0, costo_unitario: 9 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null },
      inventario: { data: { saldo_existencias: 50, costo_unitario: 5 }, error: null },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(true)
  })

  it('HU-046: ajuste_masivo admite costo_unitario=0 (archivo maestro sin dato capturado) — reconteo/compra lo rechazan igual que siempre', async () => {
    const kardexInsertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'ajuste_masivo' },
        error: null,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Alta sin costo capturado', cantidad: 12, costo_unitario: 0 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ costo_promedio_resultante: 0 }))
  })

  it('HU-046: un Reconteo real (no ajuste_masivo) con costo_unitario=0 sigue rechazándose (RN-BOD-08 sin excepción)', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'reconteo' },
        error: null,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Reconteo a costo 0', cantidad: 10, costo_unitario: 0 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-1', ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/costo unitario válido/)
  })

  it('cierra un Reconteo correctamente: el movimiento de Kardex usa tipo=reconteo, no compra (HU-029 CA-02)', async () => {
    const kardexInsertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'doc-2', numero: 'ING-2026-0002', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'reconteo' },
        error: null,
      },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Reconteo manual', cantidad: 5, costo_unitario: 20 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-2', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'reconteo' }))
  })

  it('HU-032 CA-02: línea de importación usa el costo landed (FOB×Factor), no el costo_unitario de la OC', async () => {
    const kardexInsertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-3', numero: 'ING-2026-0003', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'compra' }, error: null },
      documentos_ingreso_items: {
        data: [{
          id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Importado', cantidad: 10, costo_unitario: 999,
          es_importacion: true, costo_fob: 50, factor_nacionalizacion: 1.35,
        }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-3', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(kardexInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ costo_unitario: 67.5, costo_promedio_resultante: 67.5 }))
  })

  it('HU-032 CA-02b: bloquea el cierre si la línea de importación no tiene FOB/Factor', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-4', numero: 'ING-2026-0004', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'compra' }, error: null },
      documentos_ingreso_items: {
        data: [{
          id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Importado sin FOB', cantidad: 10, costo_unitario: 999,
          es_importacion: true, costo_fob: null, factor_nacionalizacion: null,
        }],
        error: null,
      },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-4', ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.lineasInvalidas).toEqual(['Importado sin FOB'])
  })

  it('HU-034 CA-03: cerrar un Ingreso tipo reconteo actualiza ultimo_conteo_fecha del producto', async () => {
    const inventarioUpdateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-5', numero: 'ING-2026-0005', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'reconteo' }, error: null },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Reconteo manual', cantidad: 5, costo_unitario: 20 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null, onUpdate: inventarioUpdateSpy },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-5', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(inventarioUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ ultimo_conteo_fecha: expect.any(String) }))
  })

  it('HU-034 CA-03: cerrar un Ingreso tipo compra NO toca ultimo_conteo_fecha', async () => {
    const inventarioUpdateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-6', numero: 'ING-2026-0006', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'compra' }, error: null },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Compra normal', cantidad: 5, costo_unitario: 20 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null },
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null, onUpdate: inventarioUpdateSpy },
    }))

    const resultado = await cerrarDocumentoIngreso('doc-6', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(inventarioUpdateSpy).toHaveBeenCalledWith(expect.not.objectContaining({ ultimo_conteo_fecha: expect.anything() }))
  })

  // Spec: HU-046 CA-02/CA-08 — un Ingreso normal (costo ya positivo) nunca
  // dispara la corrección; confirma que el código nuevo no afecta el flujo
  // de siempre (no-regresión explícita, más allá de que los tests de arriba
  // ya pasaban sin cambios).
  it('HU-046 CA-08: con costo_unitario ya positivo, NO se invoca ninguna corrección (no-regresión)', async () => {
    mockCrearDocumentoEgresoMasivo.mockClear()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: { id: 'doc-7', numero: 'ING-2026-0007', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'compra' }, error: null },
      documentos_ingreso_items: {
        data: [{ id: 'l1', producto_id: 'prod-1', descripcion_oc: 'Compra normal', cantidad: 5, costo_unitario: 20 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null },
      inventario: { data: { saldo_existencias: 10, costo_unitario: 8 }, error: null },
    }))
    const resultado = await cerrarDocumentoIngreso('doc-7', ACTOR)
    expect(resultado.ok).toBe(true)
    expect(mockCrearDocumentoEgresoMasivo).not.toHaveBeenCalled()
  })
})

describe('generarCorreccionCostoCeroSiAplica — HU-046 CA-02/RN-01', () => {
  beforeEach(() => {
    mockCrearDocumentoEgresoMasivo.mockReset()
    mockCerrarDocumentoEgreso.mockReset()
  })

  it('RN-01: no corrige si saldoActual = 0 (nada que sacar)', async () => {
    const resultado = await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 0, costoActual: 0, costoReal: 5,
      bodegaId: 'bod-1', actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })
    expect(resultado).toEqual({ corregido: false })
    expect(mockCrearDocumentoEgresoMasivo).not.toHaveBeenCalled()
  })

  it('RN-01: no corrige si costoActual ya es positivo (no es un vacío de datos)', async () => {
    const resultado = await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 10, costoActual: 3, costoReal: 5,
      bodegaId: 'bod-1', actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })
    expect(resultado).toEqual({ corregido: false })
    expect(mockCrearDocumentoEgresoMasivo).not.toHaveBeenCalled()
  })

  it('RN-01: no corrige si el costo de la línea real tampoco es positivo', async () => {
    const resultado = await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 10, costoActual: 0, costoReal: 0,
      bodegaId: 'bod-1', actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })
    expect(resultado).toEqual({ corregido: false })
    expect(mockCrearDocumentoEgresoMasivo).not.toHaveBeenCalled()
  })

  it('sin bodega en el disparador ni en el producto: omite la corrección y audita (best-effort)', async () => {
    const { registrarAuditoria } = require('@/lib/auditoria')
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { bodega_id: null }, error: null },
    }))
    const resultado = await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 10, costoActual: 0, costoReal: 5,
      bodegaId: null, actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })
    expect(resultado).toEqual({ corregido: false, motivo: 'sin_bodega' })
    expect(mockCrearDocumentoEgresoMasivo).not.toHaveBeenCalled()
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'correccion_costo_cero_omitida_sin_bodega', entidad_id: 'prod-1' })
    )
  })

  it('resuelve la bodega del propio producto cuando el disparador no trae ninguna', async () => {
    mockCrearDocumentoEgresoMasivo.mockResolvedValue({ ok: true, documentoId: 'egr-1', numero: 'EGR-2026-0050' })
    mockCerrarDocumentoEgreso.mockResolvedValue({ ok: false, error: 'detener aquí para aislar esta aserción' })
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { bodega_id: 'bod-del-producto' }, error: null },
    }))
    await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 10, costoActual: 0, costoReal: 5,
      bodegaId: null, actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })
    expect(mockCrearDocumentoEgresoMasivo).toHaveBeenCalledWith(
      [{ producto_id: 'prod-1', cantidad: 10, costo_objetivo: 0 }],
      'bod-del-producto', ACTOR, 'reconteo', expect.stringContaining('Ajuste automático de costo cero')
    )
  })

  // Spec: HU-046 CA-02 (ruta feliz completa) — el lado Egreso va mockeado
  // (cross-module); el lado Ingreso corre real (same-module, no mockeable
  // sin romper el propio módulo bajo prueba) contra el mock de Supabase, con
  // el inventario ya representando el estado post-Egreso (saldo/costo en 0)
  // — asunción de test doble explícita, el comportamiento real de
  // cerrarDocumentoEgreso() ya está cubierto en bodega-egreso.test.ts.
  it('ruta feliz: genera y cierra el par real (Egreso mockeado OK + Ingreso real a costo correcto)', async () => {
    const kardexInsertSpy = jest.fn()
    const docIngresoInsertSpy = jest.fn()
    mockCrearDocumentoEgresoMasivo.mockResolvedValue({ ok: true, documentoId: 'egr-1', numero: 'EGR-2026-0050' })
    mockCerrarDocumentoEgreso.mockResolvedValue({ ok: true })
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: { id: 'ing-correccion-1', numero: 'ING-2026-0099', estado: 'generado', bodega_id: 'bod-1', tipo_movimiento: 'reconteo' },
        error: null,
        onInsert: docIngresoInsertSpy,
      },
      documentos_ingreso_items: {
        data: [{ id: 'item-1', producto_id: 'prod-1', descripcion_oc: 'Ajuste automático de costo cero', cantidad: 10, costo_unitario: 5 }],
        error: null,
      },
      kardex_movimientos: { data: [], error: null, onInsert: kardexInsertSpy },
      // Asunción de test doble: ya "post-Egreso" (saldo/costo en 0).
      inventario: { data: { saldo_existencias: 0, costo_unitario: 0 }, error: null },
    }))

    const resultado = await generarCorreccionCostoCeroSiAplica({
      productoId: 'prod-1', saldoActual: 10, costoActual: 0, costoReal: 5,
      bodegaId: 'bod-1', actor: ACTOR, referenciaDisparador: 'Ingreso ING-2026-0001',
    })

    expect(mockCrearDocumentoEgresoMasivo).toHaveBeenCalledWith(
      [{ producto_id: 'prod-1', cantidad: 10, costo_objetivo: 0 }],
      'bod-1', ACTOR, 'reconteo', expect.stringContaining('Ingreso ING-2026-0001')
    )
    expect(docIngresoInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tipo_movimiento: 'reconteo', observaciones: expect.stringContaining('Ingreso ING-2026-0001') })
    )
    expect(kardexInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ producto_id: 'prod-1', direccion: 'entrada', cantidad: 10, costo_unitario: 5, costo_promedio_resultante: 5 })
    )
    expect(resultado).toEqual({ corregido: true, ingresoNumero: 'ING-2026-0099', egresoNumero: 'EGR-2026-0050' })
  })
})

describe('crearDocumentoIngresoManual — HU-029 CA-01', () => {
  it('rechaza tipo_movimiento inválido', async () => {
    const resultado = await crearDocumentoIngresoManual(
      { tipoMovimiento: 'compra' as any, lineas: [{ producto_id: 'prod-1', cantidad: 5, costo_unitario: 10 }] },
      ACTOR
    )
    expect(resultado.ok).toBe(false)
  })

  it('rechaza sin ninguna línea', async () => {
    const resultado = await crearDocumentoIngresoManual({ tipoMovimiento: 'devolucion', lineas: [] }, ACTOR)
    expect(resultado.ok).toBe(false)
  })

  it('rechaza una línea sin producto_id (CA-01: siempre obligatorio en creación manual)', async () => {
    const resultado = await crearDocumentoIngresoManual(
      { tipoMovimiento: 'reconteo', lineas: [{ producto_id: '', cantidad: 5, costo_unitario: 10 }] },
      ACTOR
    )
    expect(resultado.ok).toBe(false)
  })

  it('crea el documento con tipo_movimiento y registro_compras_id=null', async () => {
    const insertDocSpy = jest.fn()
    const insertLineasSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        onInsert: insertDocSpy,
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-3', numero: 'ING-2026-0003' }, error: null }) }) },
      },
      documentos_ingreso_items: { onInsert: insertLineasSpy, data: null, error: null },
    }))

    const resultado = await crearDocumentoIngresoManual(
      { tipoMovimiento: 'devolucion', bodegaId: 'bod-1', lineas: [{ producto_id: 'prod-1', cantidad: 3, costo_unitario: 15 }] },
      ACTOR
    )
    expect(resultado).toEqual({ ok: true, documentoId: 'doc-3', numero: 'ING-2026-0003' })
    expect(insertDocSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tipo_movimiento: 'devolucion', registro_compras_id: null, bodega_id: 'bod-1' })
    )
    expect(insertLineasSpy).toHaveBeenCalledWith([
      expect.objectContaining({ producto_id: 'prod-1', cantidad: 3, costo_unitario: 15 }),
    ])
  })
})

describe('resolverCancelacionIngresoPorOC — CA-09', () => {
  it('sin documento de ingreso asociado: ok, sin anular nada', async () => {
    mockFrom.mockImplementation(chainTabla({ documentos_ingreso: { data: null, error: null } }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado).toEqual({ ok: true, anulado: false })
  })

  it('documento ya cerrado: bloquea la cancelación de la OC', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: [{ id: 'doc-1', numero: 'ING-2026-0001', estado: 'cerrado' }], error: null },
    }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado.ok).toBe(false)
  })

  it('documento generado/en_validación: anula en cascada', async () => {
    const updateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: [{ id: 'doc-1', numero: 'ING-2026-0001', estado: 'en_validacion' }],
        error: null,
        onUpdate: updateSpy,
      },
    }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado).toEqual({ ok: true, anulado: true })
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ estado: 'anulado' }))
  })

  it('documento ya anulado: idempotente, no reintenta', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: { data: [{ id: 'doc-1', numero: 'ING-2026-0001', estado: 'anulado' }], error: null },
    }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado).toEqual({ ok: true, anulado: false })
  })

  // Spec: HU-047 CA-08 — caso nuevo: N documentos, uno ya cerrado → bloqueo
  // (aunque los otros 2 estén generado/anulado, basta 1 cerrado para bloquear).
  it('HU-047: N documentos de la misma OC, uno ya cerrado → bloquea igual que con 1 solo', async () => {
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: [
          { id: 'doc-1', numero: 'ING-2026-0001', estado: 'anulado' },
          { id: 'doc-2', numero: 'ING-2026-0002', estado: 'cerrado' },
          { id: 'doc-3', numero: 'ING-2026-0003', estado: 'generado' },
        ],
        error: null,
      },
    }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('ING-2026-0002')
  })

  // Spec: HU-047 CA-08 — caso nuevo: N documentos, ninguno cerrado → anula TODOS
  // los que no estén ya anulados (no solo el primero).
  it('HU-047: N documentos sin ninguno cerrado → anula cada uno en cascada', async () => {
    const updateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      documentos_ingreso: {
        data: [
          { id: 'doc-1', numero: 'ING-2026-0001', estado: 'generado' },
          { id: 'doc-2', numero: 'ING-2026-0002', estado: 'en_validacion' },
          { id: 'doc-3', numero: 'ING-2026-0003', estado: 'anulado' },
        ],
        error: null,
        onUpdate: updateSpy,
      },
    }))
    const resultado = await resolverCancelacionIngresoPorOC('oc-1', 'motivo real')
    expect(resultado).toEqual({ ok: true, anulado: true })
    expect(updateSpy).toHaveBeenCalledTimes(2)
  })
})
