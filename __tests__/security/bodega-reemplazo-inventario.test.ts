// Spec: HU-041 — clasificarReemplazo() es pura (CA-01/CA-03 a CA-07), sin
// mocks de Supabase. ejecutarReemplazo() se cubre de forma acotada (altas
// sin saldo + desactivaciones, sin Kardex) — la lógica del motor de Kardex
// para el tipo ajuste_masivo (RN-04/RN-05/RN-07) ya está cubierta
// directamente en bodega-ingreso.test.ts/bodega-egreso.test.ts, reutilizada
// aquí tal cual por import (nunca reimplementada).

const mockFrom = jest.fn()
const mockRpc = jest.fn(() => Promise.resolve({ data: 1, error: null }))
jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => Promise.resolve({ auth: { getUser: jest.fn() } })),
}))
jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

import { clasificarReemplazo, ejecutarReemplazo, type ProductoActual } from '@/lib/bodega-reemplazo-inventario'
import type { FilaProductoExcel } from '@/lib/bodega-analisis-migracion'

function fila(overrides: Partial<FilaProductoExcel>): FilaProductoExcel {
  return {
    codigo: 'AL-I0001',
    descripcion: 'Producto X',
    areaTexto: 'Mecánico',
    categoriaTexto: 'Cables',
    saldoExcel: 10,
    costoExcel: 5,
    inventariado: false,
    ...overrides,
  }
}

function producto(overrides: Partial<ProductoActual>): ProductoActual {
  return {
    id: 'prod-1',
    codigo: 'AL-I0001',
    activo: true,
    saldo_existencias: 10,
    costo_unitario: 5,
    ...overrides,
  }
}

const ACTOR = { id: 'u1', nombre: 'Admin', email: 'admin@arlift.com', rol: 'admin' }

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

describe('clasificarReemplazo — HU-041 CA-01/CA-03 a CA-07', () => {
  it('CA-03: código del archivo sin match en inventario => alta', () => {
    const { resumen, filas } = clasificarReemplazo([fila({ codigo: 'AL-I9999' })], [])
    expect(resumen).toEqual({ altas: 1, desactivaciones: 0, ajustes: 0, sinCambio: 0 })
    expect(filas[0]).toMatchObject({ tipo: 'alta', codigo: 'AL-I9999' })
  })

  it('CA-04: producto activo sin match en el archivo => desactivación', () => {
    const { resumen, filas } = clasificarReemplazo([], [producto({})])
    expect(resumen.desactivaciones).toBe(1)
    expect(filas[0]).toMatchObject({ tipo: 'desactivacion', productoId: 'prod-1' })
  })

  it('CA-04 (negativo): producto YA inactivo sin match en el archivo NO se vuelve a marcar', () => {
    const { resumen } = clasificarReemplazo([], [producto({ activo: false })])
    expect(resumen.desactivaciones).toBe(0)
  })

  it('CA-06: saldo/costo del archivo distinto al actual => ajuste, con delta correcto', () => {
    const { resumen, filas } = clasificarReemplazo(
      [fila({ saldoExcel: 25, costoExcel: 8 })],
      [producto({ saldo_existencias: 10, costo_unitario: 5 })]
    )
    expect(resumen.ajustes).toBe(1)
    expect(filas[0]).toMatchObject({ tipo: 'ajuste', delta: 15, saldoActual: 10, costoActual: 5, reactiva: false })
  })

  it('CA-06: delta negativo cuando el saldo del archivo es menor', () => {
    const { filas } = clasificarReemplazo(
      [fila({ saldoExcel: 4, costoExcel: 5 })],
      [producto({ saldo_existencias: 10, costo_unitario: 5 })]
    )
    expect(filas[0]).toMatchObject({ tipo: 'ajuste', delta: -6 })
  })

  // Spec: HU-045 CA-06/RN-03 — un saldo objetivo negativo nunca genera un
  // delta más negativo que -saldoActual (nunca pediría más de lo disponible).
  it('HU-045 CA-06: saldo objetivo negativo del archivo se limita a 0 (nunca excede el saldo disponible)', () => {
    const { filas } = clasificarReemplazo(
      [fila({ saldoExcel: -13, costoExcel: 5 })],
      [producto({ saldo_existencias: 135, costo_unitario: 5 })]
    )
    expect(filas[0]).toMatchObject({ tipo: 'ajuste', delta: -135, saldoActual: 135 })
  })

  it('HU-045 CA-06: no muta el fila.saldoExcel original del archivo (se preserva para auditoría)', () => {
    const filaOriginal = fila({ saldoExcel: -13, costoExcel: 5 })
    clasificarReemplazo([filaOriginal], [producto({ saldo_existencias: 135, costo_unitario: 5 })])
    expect(filaOriginal.saldoExcel).toBe(-13)
  })

  it('CA-07: saldo y costo idénticos => sin_cambio (nunca ajuste)', () => {
    const { resumen, filas } = clasificarReemplazo(
      [fila({ saldoExcel: 10, costoExcel: 5 })],
      [producto({ saldo_existencias: 10, costo_unitario: 5 })]
    )
    expect(resumen).toEqual({ altas: 0, desactivaciones: 0, ajustes: 0, sinCambio: 1 })
    expect(filas[0]).toMatchObject({ tipo: 'sin_cambio' })
  })

  it('CA-05: producto inactivo que reaparece en el archivo => reactiva:true (incluso sin cambio de saldo/costo)', () => {
    const { filas } = clasificarReemplazo(
      [fila({ saldoExcel: 10, costoExcel: 5 })],
      [producto({ activo: false, saldo_existencias: 10, costo_unitario: 5 })]
    )
    expect(filas[0]).toMatchObject({ tipo: 'sin_cambio', reactiva: true })
  })

  it('un mismo archivo puede producir las 4 clasificaciones simultáneamente', () => {
    const { resumen } = clasificarReemplazo(
      [
        fila({ codigo: 'NUEVO', saldoExcel: 1, costoExcel: 1 }),
        fila({ codigo: 'AJUSTE', saldoExcel: 99, costoExcel: 1 }),
        fila({ codigo: 'IGUAL', saldoExcel: 10, costoExcel: 5 }),
      ],
      [
        producto({ id: 'p-aj', codigo: 'AJUSTE', saldo_existencias: 10, costo_unitario: 5 }),
        producto({ id: 'p-ig', codigo: 'IGUAL', saldo_existencias: 10, costo_unitario: 5 }),
        producto({ id: 'p-des', codigo: 'DESAPARECE' }),
      ]
    )
    expect(resumen).toEqual({ altas: 1, desactivaciones: 1, ajustes: 1, sinCambio: 1 })
  })
})

describe('ejecutarReemplazo — HU-041 CA-02 a CA-04, RN-06 (alcance acotado sin Kardex)', () => {
  it('alta con saldoExcel=0: crea el producto, sin generar ningún movimiento de Kardex', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { id: 'nuevo-1' }, error: null, onInsert: insertSpy },
    }))
    const resultado = await ejecutarReemplazo(
      [{ tipo: 'alta', codigo: 'NUEVO', datos: fila({ codigo: 'NUEVO', saldoExcel: 0, costoExcel: 0 }) }],
      ACTOR,
      'bodega-1'
    )
    expect(resultado.altas).toBe(1)
    expect(resultado.ajustesIngreso).toBe(0)
    expect(resultado.errores).toEqual([])
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NUEVO', activo: true, saldo_existencias: 0 }))
  })

  it('desactivación: marca activo=false sin tocar saldo/costo', async () => {
    const updateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: null, error: null, onUpdate: updateSpy },
    }))
    const resultado = await ejecutarReemplazo(
      [{ tipo: 'desactivacion', codigo: 'VIEJO', productoId: 'prod-1' }],
      ACTOR,
      'bodega-1'
    )
    expect(resultado.desactivaciones).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({ activo: false })
  })

  it('RN-06: un error puntual en una fila no detiene el resto (best-effort)', async () => {
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: null, error: { message: 'duplicado' } },
    }))
    const resultado = await ejecutarReemplazo(
      [{ tipo: 'alta', codigo: 'FALLA', datos: fila({ codigo: 'FALLA' }) }],
      ACTOR,
      'bodega-1'
    )
    expect(resultado.altas).toBe(0)
    expect(resultado.errores).toEqual([expect.stringContaining('FALLA')])
  })

  // Spec: HU-045 CA-04 — fechaConteo solo se aplica a productos marcados
  // como físicamente contados por el archivo (datos.inventariado).
  it('HU-045 CA-04: alta con fechaConteo + inventariado=true fija ultimo_conteo_fecha en el insert', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { id: 'nuevo-1' }, error: null, onInsert: insertSpy },
    }))
    await ejecutarReemplazo(
      [{ tipo: 'alta', codigo: 'NUEVO', datos: fila({ codigo: 'NUEVO', saldoExcel: 0, costoExcel: 0, inventariado: true }) }],
      ACTOR,
      'bodega-1',
      '2026-11-22'
    )
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ ultimo_conteo_fecha: '2026-11-22' }))
  })

  it('HU-045 CA-04: alta con fechaConteo pero inventariado=false NO fija ultimo_conteo_fecha', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { id: 'nuevo-1' }, error: null, onInsert: insertSpy },
    }))
    await ejecutarReemplazo(
      [{ tipo: 'alta', codigo: 'NUEVO', datos: fila({ codigo: 'NUEVO', saldoExcel: 0, costoExcel: 0, inventariado: false }) }],
      ACTOR,
      'bodega-1',
      '2026-11-22'
    )
    expect(insertSpy.mock.calls[0][0].ultimo_conteo_fecha).toBeUndefined()
  })

  it('HU-045 CA-04: sin fechaConteo, aunque inventariado=true, NO fija ultimo_conteo_fecha (retrocompatibilidad)', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: { id: 'nuevo-1' }, error: null, onInsert: insertSpy },
    }))
    await ejecutarReemplazo(
      [{ tipo: 'alta', codigo: 'NUEVO', datos: fila({ codigo: 'NUEVO', saldoExcel: 0, costoExcel: 0, inventariado: true }) }],
      ACTOR,
      'bodega-1'
    )
    expect(insertSpy.mock.calls[0][0].ultimo_conteo_fecha).toBeUndefined()
  })

  it('HU-045 CA-04: sin_cambio con fechaConteo + inventariado=true fija ultimo_conteo_fecha en el update', async () => {
    const updateSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      inventario: { data: null, error: null, onUpdate: updateSpy },
    }))
    await ejecutarReemplazo(
      [{
        tipo: 'sin_cambio',
        codigo: 'IGUAL',
        productoId: 'prod-1',
        datos: fila({ codigo: 'IGUAL', inventariado: true }),
        reactiva: false,
      }],
      ACTOR,
      'bodega-1',
      '2026-11-22'
    )
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ ultimo_conteo_fecha: '2026-11-22' }))
  })
})
