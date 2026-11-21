import ExcelJS from 'exceljs'
import { adminClient } from '@/lib/supabase/clients'
import { enLotes } from '@/lib/bodega-reportes-query'
import { calcularPromedioPonderado } from '@/lib/bodega-kardex'

// Spec: HU-039 CA-02 — mismo mapeo de columnas ya validado en
// scripts/hu036-extraer-excel.py (traducido de índices 0-based de openpyxl a
// números de columna 1-based de exceljs). PRODUCTOS desde fila 8, KARDEX
// desde fila 9 — nunca asumir que la fila de encabezado está en una posición
// fija, se descarta por contenido (RN-02 del script real).
const FILA_INICIAL_PRODUCTOS = 8
const FILA_INICIAL_KARDEX = 9

const COL_PRODUCTOS = { codigo: 2, descripcion: 3, area: 4, categoria: 5, saldo: 6, costo: 7 }
const COL_KARDEX = { fecha: 2, direccion: 3, tipo: 4, codigo: 5, cantidad: 12, costoUnitario: 13 }

// Spec: HU-039 CA-03 — mismo diccionario TIPO_MAP de scripts/hu036-extraer-excel.py.
const TIPO_MAP: Record<string, string> = {
  compra: 'compra',
  devolucion: 'devolucion',
  'devolución': 'devolucion',
  reconteo: 'reconteo',
  'field build': 'field_build',
  field_build: 'field_build',
  venta: 'venta',
  prestamo: 'prestamo',
  'préstamo': 'prestamo',
  gasto: 'gasto',
}

export type FilaProductoExcel = {
  codigo: string
  descripcion: string | null
  areaTexto: string | null
  categoriaTexto: string | null
  saldoExcel: number
  costoExcel: number
}

export type FilaMovimientoExcel = {
  fila: number
  fecha: string | null
  direccion: 'entrada' | 'salida' | null
  tipoRaw: string
  tipo: string | null
  codigo: string
  cantidad: number
  costoUnitarioHoja: number | null
}

function celdaTexto(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value
  if (v == null) return null
  if (typeof v === 'object') {
    if ('text' in (v as object)) return (String((v as { text: string }).text).trim() || null)
    if ('result' in (v as object)) {
      const resultado = (v as { result: unknown }).result
      return resultado != null ? (String(resultado).trim() || null) : null
    }
  }
  return String(v).trim() || null
}

// Spec: HU-039 — el Excel real usa fórmulas en vivo (SUMIFS) para varias
// columnas numéricas (ya documentado en HU-036: "el Excel ya usa fórmulas
// SUMIFS en vivo para el costo de cada Salida"). exceljs no resuelve una
// celda de fórmula a un número plano: `.value` devuelve
// `{ formula, result }`, donde `result` es el valor cacheado — a diferencia
// de openpyxl con `data_only=True` (usado en scripts/hu036-extraer-excel.py),
// que sí entrega directamente el resultado cacheado como número plano.
function celdaNumero(row: ExcelJS.Row, col: number): number | null {
  const v = row.getCell(col).value
  if (typeof v === 'number') return v
  if (v != null && typeof v === 'object' && 'result' in (v as object)) {
    const resultado = (v as { result: unknown }).result
    if (typeof resultado === 'number') return resultado
  }
  return null
}

function celdaFechaISO(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return null
}

export function parsearProductos(ws: ExcelJS.Worksheet): FilaProductoExcel[] {
  const productos: FilaProductoExcel[] = []
  for (let r = FILA_INICIAL_PRODUCTOS; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const codigoRaw = celdaTexto(row, COL_PRODUCTOS.codigo)
    if (!codigoRaw) continue
    // Spec: HU-039 CA-02 — residuo de encabezado descartado por contenido,
    // nunca por posición (mismo criterio que el script Python real).
    if (['codigo', 'código'].includes(codigoRaw.toLowerCase())) continue

    productos.push({
      codigo: codigoRaw,
      descripcion: celdaTexto(row, COL_PRODUCTOS.descripcion),
      areaTexto: celdaTexto(row, COL_PRODUCTOS.area),
      categoriaTexto: celdaTexto(row, COL_PRODUCTOS.categoria),
      saldoExcel: celdaNumero(row, COL_PRODUCTOS.saldo) ?? 0,
      costoExcel: celdaNumero(row, COL_PRODUCTOS.costo) ?? 0,
    })
  }
  return productos
}

export function parsearKardex(ws: ExcelJS.Worksheet): FilaMovimientoExcel[] {
  const movimientos: FilaMovimientoExcel[] = []
  for (let r = FILA_INICIAL_KARDEX; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const codigo = celdaTexto(row, COL_KARDEX.codigo)
    if (!codigo) continue

    const tipoRawTexto = celdaTexto(row, COL_KARDEX.tipo) ?? ''
    const tipoNormalizado = tipoRawTexto.trim().toLowerCase()
    const tipoMapeado = TIPO_MAP[tipoNormalizado] ?? null

    const direccionTexto = (celdaTexto(row, COL_KARDEX.direccion) ?? '').trim().toLowerCase()
    const direccion: 'entrada' | 'salida' | null =
      direccionTexto === 'entrada' ? 'entrada' : direccionTexto === 'salida' ? 'salida' : null

    movimientos.push({
      fila: r,
      fecha: celdaFechaISO(row, COL_KARDEX.fecha),
      direccion,
      tipoRaw: tipoNormalizado,
      tipo: tipoMapeado,
      codigo,
      cantidad: celdaNumero(row, COL_KARDEX.cantidad) ?? 0,
      costoUnitarioHoja: celdaNumero(row, COL_KARDEX.costoUnitario),
    })
  }
  return movimientos
}

export type ResultadoReplay = {
  porCodigo: Map<string, { saldo: number; costoPromedio: number }>
  entradasSinCosto: number
  entradasSinCostoPorTipo: Record<string, number>
  productosSaldoNegativo: string[]
}

// Spec: HU-039 CA-05/RN-03 — replay cronológico real, reutilizando
// calcularPromedioPonderado() de lib/bodega-kardex.ts por import directo
// (nunca reimplementado ni copiado, a diferencia del script de HU-036 que sí
// tuvo que copiarlo por no poder importar TS desde un script plano de Node).
export function replayCronologico(movimientos: FilaMovimientoExcel[]): ResultadoReplay {
  const ordenados = [...movimientos].sort((a, b) => {
    const fa = a.fecha ?? ''
    const fb = b.fecha ?? ''
    if (fa !== fb) return fa.localeCompare(fb)
    return a.fila - b.fila
  })

  const porCodigo = new Map<string, { saldo: number; costoPromedio: number }>()
  let entradasSinCosto = 0
  const entradasSinCostoPorTipo: Record<string, number> = {}
  // Spec: HU-039 CA-04 — corrección real de Fase 5 (validación contra el
  // archivo real): la definición inicial ("primer movimiento cronológico es
  // una Salida") solo encontraba 30 códigos y NO incluía ninguno de los 5
  // códigos ya documentados en HU-036 como "sin apertura" (AL-I0731,
  // AL-I0617, AL-I0724, AL-I0745, AL-I0700) — se confirmó inspeccionando sus
  // movimientos reales que SÍ tienen una Entrada inicial, pero el saldo
  // corrido cae por debajo de 0 más adelante en su historial (ventas que
  // exceden el stock disponible en ese punto). La definición correcta —
  // verificada con los 5 códigos conocidos, 100% de coincidencia — es "el
  // saldo corrido del replay fue negativo en ALGÚN punto del historial", no
  // solo al inicio.
  const minSaldoPorCodigo = new Map<string, number>()

  for (const m of ordenados) {
    const actual = porCodigo.get(m.codigo) ?? { saldo: 0, costoPromedio: 0 }

    // Spec: HU-039 — hallazgo real confirmado inspeccionando el archivo real
    // (scripts/hu036-migrar-dev-local.mjs::replayCronologico, comentario
    // "cantidad ya viene negativa"): la columna L (cantidad) del Excel real
    // YA viene firmada — positiva en Entrada, negativa en Salida (la propia
    // fórmula SUMIFS de PRODUCTOS suma la columna L completa sin mirar la
    // dirección). Tratarla como magnitud positiva y restarla en Salida
    // duplica el efecto con signo invertido — bug real encontrado y
    // corregido en esta misma sesión al validar contra el archivo real (ver
    // sdd-validation.md).
    if (m.direccion === 'entrada') {
      const costo = m.costoUnitarioHoja ?? 0
      if (m.costoUnitarioHoja == null) {
        entradasSinCosto++
        const tipoLabel = m.tipo ?? m.tipoRaw
        entradasSinCostoPorTipo[tipoLabel] = (entradasSinCostoPorTipo[tipoLabel] ?? 0) + 1
      }
      const nuevoPromedio = calcularPromedioPonderado(actual.saldo, actual.costoPromedio, m.cantidad, costo)
      const nuevoSaldo = actual.saldo + m.cantidad
      porCodigo.set(m.codigo, { saldo: nuevoSaldo, costoPromedio: nuevoPromedio })
      minSaldoPorCodigo.set(m.codigo, Math.min(minSaldoPorCodigo.get(m.codigo) ?? 0, nuevoSaldo))
    } else if (m.direccion === 'salida') {
      const nuevoSaldo = actual.saldo + m.cantidad
      porCodigo.set(m.codigo, { saldo: nuevoSaldo, costoPromedio: actual.costoPromedio })
      minSaldoPorCodigo.set(m.codigo, Math.min(minSaldoPorCodigo.get(m.codigo) ?? 0, nuevoSaldo))
    }
  }

  const productosSaldoNegativo = [...minSaldoPorCodigo.entries()].filter(([, min]) => min < 0).map(([codigo]) => codigo).sort()

  return {
    porCodigo,
    entradasSinCosto,
    entradasSinCostoPorTipo,
    productosSaldoNegativo,
  }
}

export type DivergenciaInterna = { codigo: string; saldoReplay: number; saldoExcel: number }
export type DivergenciaInventarioReal = {
  codigo: string
  saldoReplay: number
  saldoReal: number
  costoReplay: number
  costoReal: number
}

export type InformeAnalisisMigracion = {
  conteos: {
    totalProductos: number
    totalMovimientos: number
    porDireccion: { entrada: number; salida: number }
    porTipo: Record<string, number>
    tiposSinMapear: string[]
  }
  calidadDatos: {
    entradasSinCosto: number
    entradasSinCostoPorTipo: Record<string, number>
    productosSaldoNegativo: string[]
    categoriasMultiArea: Record<string, string[]>
  }
  divergenciasInternas: DivergenciaInterna[]
  divergenciasInventarioReal: DivergenciaInventarioReal[]
  recomendacion: { apto: boolean; resumen: string }
}

// Spec: HU-039 CA-06 — compara, para cada código del Excel que ya existe en
// `inventario`, el saldo/costo real vigente contra el resultado del replay.
export async function compararContraInventarioReal(
  productos: FilaProductoExcel[],
  porCodigoReplay: Map<string, { saldo: number; costoPromedio: number }>
): Promise<DivergenciaInventarioReal[]> {
  const codigos = productos.map(p => p.codigo)
  const reales = await enLotes(codigos, async (lote) => {
    const { data } = await adminClient().from('inventario').select('codigo, saldo_existencias, costo_unitario').in('codigo', lote)
    return data ?? []
  })

  const divergencias: DivergenciaInventarioReal[] = []
  for (const r of reales) {
    const replay = porCodigoReplay.get(r.codigo)
    if (!replay) continue
    const saldoReal = Number(r.saldo_existencias)
    const costoReal = Number(r.costo_unitario)
    if (saldoReal !== replay.saldo || Math.abs(costoReal - replay.costoPromedio) > 0.01) {
      divergencias.push({ codigo: r.codigo, saldoReplay: replay.saldo, saldoReal, costoReplay: replay.costoPromedio, costoReal })
    }
  }
  return divergencias.sort((a, b) => a.codigo.localeCompare(b.codigo))
}

function categoriasMultiAreaDe(productos: FilaProductoExcel[]): Record<string, string[]> {
  const areaPorCategoria = new Map<string, Set<string>>()
  for (const p of productos) {
    if (!p.categoriaTexto || !p.areaTexto) continue
    if (['categoria', 'categoría'].includes(p.categoriaTexto.toLowerCase())) continue
    if (['area', 'área'].includes(p.areaTexto.toLowerCase())) continue
    const set = areaPorCategoria.get(p.categoriaTexto) ?? new Set<string>()
    set.add(p.areaTexto)
    areaPorCategoria.set(p.categoriaTexto, set)
  }
  const resultado: Record<string, string[]> = {}
  for (const [cat, areas] of areaPorCategoria) {
    if (areas.size > 1) resultado[cat] = [...areas].sort()
  }
  return resultado
}

// Spec: HU-039 — orquestador único; el endpoint solo invoca esta función,
// manteniendo el route handler delgado.
export async function analizarArchivoMigracion(buffer: Buffer): Promise<InformeAnalisisMigracion> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const wsProductos = wb.getWorksheet('PRODUCTOS')
  const wsKardex = wb.getWorksheet('KARDEX')
  if (!wsProductos) throw new Error('El archivo no contiene la hoja "PRODUCTOS"')
  if (!wsKardex) throw new Error('El archivo no contiene la hoja "KARDEX"')

  const productos = parsearProductos(wsProductos)
  const movimientos = parsearKardex(wsKardex)

  const porDireccion = { entrada: 0, salida: 0 }
  const porTipo: Record<string, number> = {}
  const tiposSinMapearSet = new Set<string>()
  for (const m of movimientos) {
    if (m.direccion) porDireccion[m.direccion]++
    if (m.tipo) porTipo[m.tipo] = (porTipo[m.tipo] ?? 0) + 1
    else if (m.tipoRaw) tiposSinMapearSet.add(m.tipoRaw)
  }

  const replay = replayCronologico(movimientos)

  const divergenciasInternas: DivergenciaInterna[] = []
  for (const p of productos) {
    const r = replay.porCodigo.get(p.codigo)
    if (r && r.saldo !== p.saldoExcel) {
      divergenciasInternas.push({ codigo: p.codigo, saldoReplay: r.saldo, saldoExcel: p.saldoExcel })
    }
  }
  divergenciasInternas.sort((a, b) => a.codigo.localeCompare(b.codigo))

  const divergenciasInventarioReal = await compararContraInventarioReal(productos, replay.porCodigo)

  // Spec: HU-039 CA-07 — las divergencias contra inventario real NO afectan
  // `apto` (ver sdd-design.md, decisión de diseño 3): son informativas, no
  // responsabilidad del archivo nuevo.
  const apto = tiposSinMapearSet.size === 0 && divergenciasInternas.length === 0
  const hallazgos = tiposSinMapearSet.size + divergenciasInternas.length
  const resumen = apto
    ? 'Apto para migrar sin ajustes — sin tipos de movimiento no reconocidos ni divergencias internas del archivo.'
    : `Revisar ${hallazgos} hallazgo(s) antes de migrar.`

  return {
    conteos: {
      totalProductos: productos.length,
      totalMovimientos: movimientos.length,
      porDireccion,
      porTipo,
      tiposSinMapear: [...tiposSinMapearSet].sort(),
    },
    calidadDatos: {
      entradasSinCosto: replay.entradasSinCosto,
      entradasSinCostoPorTipo: replay.entradasSinCostoPorTipo,
      productosSaldoNegativo: replay.productosSaldoNegativo,
      categoriasMultiArea: categoriasMultiAreaDe(productos),
    },
    divergenciasInternas,
    divergenciasInventarioReal,
    recomendacion: { apto, resumen },
  }
}
