// Spec: HU-039-v2.md — CA-02 a CA-07
//
// Nota: jest.config.ts redirige TODO import de 'exceljs' al mock estático
// del proyecto (__mocks__/exceljs.ts, usado por los tests de exportación —
// solo trackea addRow(), nunca lee/parsea celdas reales). jest.unmock() no
// revierte un moduleNameMapper, así que este archivo prueba el parseo contra
// objetos "worksheet" fake mínimos (misma forma que ExcelJS.Row/Worksheet
// real usa: rowCount + getRow(n).getCell(col).value) en vez de construir un
// workbook real — la cobertura del camino completo (parseo real de un
// archivo .xlsx real) se hace con validación HTTP real, ver sdd-validation.md.

import type ExcelJS from 'exceljs'

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => ({ from: mockFrom }),
}))

import {
  parsearProductos,
  parsearKardex,
  replayCronologico,
  compararContraInventarioReal,
  type FilaMovimientoExcel,
  type FilaProductoExcel,
} from '@/lib/bodega-analisis-migracion'

type CeldaValor = string | number | Date | null

function wsFake(filas: Record<number, CeldaValor[]>, rowCount: number): ExcelJS.Worksheet {
  return {
    rowCount,
    getRow: (r: number) => ({
      getCell: (col: number) => ({ value: filas[r]?.[col - 1] ?? null }),
    }),
  } as unknown as ExcelJS.Worksheet
}

function mov(overrides: Partial<FilaMovimientoExcel>): FilaMovimientoExcel {
  return {
    fila: 9, fecha: '2026-01-01', direccion: 'entrada', tipoRaw: 'compra', tipo: 'compra',
    codigo: 'AL-I0001', cantidad: 1, costoUnitarioHoja: 10,
    ...overrides,
  }
}

describe('parsearProductos (CA-02)', () => {
  it('lee desde la fila 8, columnas B-G, descarta residuo de encabezado y filas sin código', () => {
    const ws = wsFake({
      // índice 0 = columna A (sin uso) — mismo corrimiento que ExcelJS.Row.values real.
      8: [null, 'Codigo', 'Descripcion', 'Area', 'Categoria', 'Saldo', 'Costo'], // residuo de encabezado
      // índice 11 = columna L (12): "Inventario piloto nov-2026" — Spec: HU-045 CA-03.
      9: [null, 'AL-I0001', 'Producto 1', 'Mecánico', 'Cables', 10, 5, null, null, null, null, 'INVENTARIADO · Consumible'],
      10: [null, null, 'Fila vacía sin código'],
      11: [null, 'AL-I0002', 'Producto 2', null, null, 0, 0, null, null, null, null, 'NO INVENTARIADO · Sin área'],
    }, 11)

    const productos = parsearProductos(ws)
    expect(productos).toEqual([
      { codigo: 'AL-I0001', descripcion: 'Producto 1', areaTexto: 'Mecánico', categoriaTexto: 'Cables', saldoExcel: 10, costoExcel: 5, inventariado: true },
      { codigo: 'AL-I0002', descripcion: 'Producto 2', areaTexto: null, categoriaTexto: null, saldoExcel: 0, costoExcel: 0, inventariado: false },
    ])
  })

  // Spec: HU-045 CA-03 — un archivo candidato sin esa columna (ej. uno sin
  // conciliar todavía) nunca debe hacer fallar el parseo; inventariado=false
  // es el valor seguro por defecto, nunca "asumido contado".
  it('columna "Inventario piloto" ausente del archivo => inventariado siempre false', () => {
    const ws = wsFake({
      9: [null, 'AL-I0003', 'Producto 3', 'Eléctrico', 'Cables', 7, 3],
    }, 9)

    const productos = parsearProductos(ws)
    expect(productos).toEqual([
      { codigo: 'AL-I0003', descripcion: 'Producto 3', areaTexto: 'Eléctrico', categoriaTexto: 'Cables', saldoExcel: 7, costoExcel: 3, inventariado: false },
    ])
  })
})

describe('parsearKardex (CA-02/CA-03)', () => {
  it('lee desde la fila 9, columnas B/C/D/E/L/M, mapea tipo y dirección', () => {
    const fecha = new Date('2026-01-15T00:00:00Z')
    const ws = wsFake({
      // índice 0 = columna A (sin uso); fecha=B, dirección=C, tipo=D, código=E, ..., cantidad=L, costo=M.
      9:  [null, fecha, 'Entrada', 'Compra', 'AL-I0001', null, null, null, null, null, null, 5, 10],
      10: [null, fecha, 'Salida', 'Venta', 'AL-I0001', null, null, null, null, null, null, 2, null],
      11: [null, fecha, 'Entrada', 'TipoRaro', 'AL-I0002', null, null, null, null, null, null, 1, 3],
    }, 11)

    const movs = parsearKardex(ws)
    expect(movs).toHaveLength(3)
    expect(movs[0]).toEqual(expect.objectContaining({ fecha: '2026-01-15', direccion: 'entrada', tipo: 'compra', tipoRaw: 'compra', cantidad: 5, costoUnitarioHoja: 10 }))
    expect(movs[1]).toEqual(expect.objectContaining({ direccion: 'salida', tipo: 'venta', cantidad: 2, costoUnitarioHoja: null }))
    expect(movs[2]).toEqual(expect.objectContaining({ tipo: null, tipoRaw: 'tiporaro' }))
  })
})

describe('replayCronologico (CA-04/CA-05)', () => {
  it('calcula el promedio ponderado real en orden cronológico (fecha, luego fila)', () => {
    const movs = [
      mov({ fila: 10, fecha: '2026-01-02', direccion: 'entrada', cantidad: 5, costoUnitarioHoja: 20 }),
      mov({ fila: 9, fecha: '2026-01-01', direccion: 'entrada', cantidad: 10, costoUnitarioHoja: 10 }),
    ]
    const r = replayCronologico(movs)
    expect(r.porCodigo.get('AL-I0001')!.saldo).toBe(15)
    expect(r.porCodigo.get('AL-I0001')!.costoPromedio).toBeCloseTo(13.333, 2)
  })

  it('una Salida nunca recalcula el costo promedio (cantidad ya viene negativa, igual que el Excel real)', () => {
    const movs = [
      mov({ fila: 9, direccion: 'entrada', cantidad: 10, costoUnitarioHoja: 10 }),
      mov({ fila: 10, direccion: 'salida', cantidad: -3, costoUnitarioHoja: null }),
    ]
    const r = replayCronologico(movs)
    expect(r.porCodigo.get('AL-I0001')).toEqual({ saldo: 7, costoPromedio: 10 })
  })

  it('CA-04: cuenta Entradas sin costo capturado, desglosado por tipo', () => {
    const movs = [
      mov({ fila: 9, tipo: 'reconteo', tipoRaw: 'reconteo', costoUnitarioHoja: null }),
      mov({ fila: 10, codigo: 'AL-I0002', tipo: 'compra', tipoRaw: 'compra', costoUnitarioHoja: null }),
      mov({ fila: 11, codigo: 'AL-I0003', tipo: 'compra', tipoRaw: 'compra', costoUnitarioHoja: 5 }),
    ]
    const r = replayCronologico(movs)
    expect(r.entradasSinCosto).toBe(2)
    expect(r.entradasSinCostoPorTipo).toEqual({ reconteo: 1, compra: 1 })
  })

  it('CA-04: saldo negativo = el saldo corrido fue negativo en ALGÚN punto del historial, no solo al final', () => {
    const movs = [
      // AL-I0001: sin ninguna Entrada, Salida inmediata -> negativo desde el inicio
      mov({ fila: 9, codigo: 'AL-I0001', direccion: 'salida', cantidad: -2 }),
      // AL-I0002: SÍ tiene una Entrada inicial, pero una Salida posterior excede el saldo
      // disponible en ese punto -> negativo a mitad de historial, aunque termine positivo
      mov({ fila: 10, codigo: 'AL-I0002', direccion: 'entrada', cantidad: 5, costoUnitarioHoja: 1 }),
      mov({ fila: 11, codigo: 'AL-I0002', direccion: 'salida', cantidad: -8 }),
      mov({ fila: 12, codigo: 'AL-I0002', direccion: 'entrada', cantidad: 10, costoUnitarioHoja: 1 }),
      // AL-I0003: nunca negativo
      mov({ fila: 13, codigo: 'AL-I0003', direccion: 'entrada', cantidad: 5, costoUnitarioHoja: 1 }),
      mov({ fila: 14, codigo: 'AL-I0003', direccion: 'salida', cantidad: -3 }),
    ]
    const r = replayCronologico(movs)
    expect(r.productosSaldoNegativo).toEqual(['AL-I0001', 'AL-I0002'])
  })
})

describe('compararContraInventarioReal (CA-06)', () => {
  function producto(codigo: string): FilaProductoExcel {
    return { codigo, descripcion: 'X', areaTexto: null, categoriaTexto: null, saldoExcel: 0, costoExcel: 0, inventariado: false }
  }

  it('reporta divergencia cuando el código ya existe en inventario con otro saldo/costo', async () => {
    mockFrom.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [{ codigo: 'AL-I0001', saldo_existencias: 999, costo_unitario: 1 }], error: null }) }) })
    const replay = new Map([['AL-I0001', { saldo: 10, costoPromedio: 10 }]])
    const r = await compararContraInventarioReal([producto('AL-I0001')], replay)
    expect(r).toEqual([{ codigo: 'AL-I0001', saldoReplay: 10, saldoReal: 999, costoReplay: 10, costoReal: 1 }])
  })

  it('no reporta divergencia cuando saldo y costo coinciden', async () => {
    mockFrom.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [{ codigo: 'AL-I0001', saldo_existencias: 10, costo_unitario: 10 }], error: null }) }) })
    const replay = new Map([['AL-I0001', { saldo: 10, costoPromedio: 10 }]])
    const r = await compararContraInventarioReal([producto('AL-I0001')], replay)
    expect(r).toEqual([])
  })

  it('ignora códigos del Excel que no existen todavía en inventario', async () => {
    mockFrom.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) })
    const replay = new Map([['AL-I9999', { saldo: 1, costoPromedio: 1 }]])
    const r = await compararContraInventarioReal([producto('AL-I9999')], replay)
    expect(r).toEqual([])
  })
})
