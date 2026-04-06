/**
 * REQSYS — Seed desde Excel
 * Genera seed-inventario.sql y seed-compras.sql listos para pegar en Supabase SQL Editor.
 *
 * Uso:
 *   node scripts/seed-from-excel.js
 *
 * Output en scripts/output/:
 *   seed-inventario.sql
 *   seed-compras.sql
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const DATA_DIR   = path.resolve(__dirname, '../../documents/data')
const OUTPUT_DIR = path.resolve(__dirname, 'output')

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR)

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convierte número serial de Excel a string 'YYYY-MM-DD', o null. */
function excelDateToISO(value) {
  if (!value) return null
  if (typeof value === 'string') {
    // Intentar parsear "26-Nov-24", "07-Dec-24", etc.
    const d = new Date(value)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof value === 'number' && value > 1000) {
    // Excel epoch: Dec 30, 1899
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
  }
  return null
}

/** Escapa texto para SQL (single quotes). */
function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL'
  return `'${String(val).replace(/'/g, "''").replace(/\r?\n/g, ' ').trim()}'`
}

/** Número o NULL. */
function num(val) {
  const n = parseFloat(val)
  return isNaN(n) ? 'NULL' : n.toFixed(2)
}

/** Entero o NULL. */
function int(val) {
  const n = parseInt(val)
  return isNaN(n) ? 'NULL' : n
}

/** Genera bloques de INSERT en lotes de `size`. */
function buildInserts(table, columns, rows, size = 200) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    const vals  = batch.map(r => `(${r})`).join(',\n  ')
    chunks.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n  ${vals};`)
  }
  return chunks.join('\n\n')
}

// ─── INVENTARIO ─────────────────────────────────────────────────────────────

console.log('Procesando Control_Inventario.xlsx...')
const wbInv  = XLSX.readFile(path.join(DATA_DIR, 'Control_Inventario.xlsx'))
const wsInv  = wbInv.Sheets['PRODUCTOS']
const rawInv = XLSX.utils.sheet_to_json(wsInv, { header: 1 })

// Header real en fila 8 (índice 7)
const HEADER_ROW_INV = 7
const rowsInv = []

for (let i = HEADER_ROW_INV + 1; i < rawInv.length; i++) {
  const r = rawInv[i]
  if (!r || !r[0] || typeof r[0] !== 'string' || !r[0].startsWith('AL-')) continue

  // Saltar filas sin descripción (filas vacías del Excel)
  if (!r[1]) continue

  const codigo    = esc(r[0])
  const descr     = esc(r[1])
  const area      = esc(r[2])
  const categoria = esc(r[3])
  const saldo     = num(r[4])
  const costo     = num(r[5])
  const locacion  = esc(r[6])
  const codOrig   = esc(typeof r[7] === 'number' ? String(r[7]) : r[7])
  const descrOrig = esc(r[8])
  const marca     = esc(r[9])

  rowsInv.push(
    `${codigo}, ${descr}, ${area}, ${categoria}, ${saldo}, ${costo}, ${locacion}, ${codOrig}, ${descrOrig}, ${marca}`
  )
}

const colsInv = ['codigo','descripcion','area','categoria','saldo_existencias','costo_unitario','locacion','codigo_origen','descripcion_origen','marca']

const sqlInv = `-- REQSYS — Seed Inventario
-- Generado: ${new Date().toISOString()}
-- Fuente: Control_Inventario.xlsx → PRODUCTOS
-- Total items: ${rowsInv.length}

TRUNCATE TABLE inventario RESTART IDENTITY CASCADE;

${buildInserts('inventario', colsInv, rowsInv)}
`

fs.writeFileSync(path.join(OUTPUT_DIR, 'seed-inventario.sql'), sqlInv)
console.log(`  ✓ seed-inventario.sql — ${rowsInv.length} items`)

// ─── REGISTRO DE COMPRAS ─────────────────────────────────────────────────────

console.log('Procesando REGISTRO_COMPRAS.xlsx...')
const wbComp  = XLSX.readFile(path.join(DATA_DIR, 'REGISTRO_COMPRAS.xlsx'))
const wsComp  = wbComp.Sheets['2025 2026 (2)']
const rawComp = XLSX.utils.sheet_to_json(wsComp, { header: 1 })

// Header en fila 1 (índice 0), datos desde fila 2 (índice 1)
const rowsComp = []

for (let i = 1; i < rawComp.length; i++) {
  const r = rawComp[i]
  // Solo filas donde r[0] es un número (campo ITEM)
  if (!r || typeof r[0] !== 'number') continue

  const item         = int(r[0])
  const fechaNp      = esc(excelDateToISO(r[1]))
  const numeroNp     = esc(r[2])
  const proveedor    = esc(r[5])
  const fechaOc      = esc(excelDateToISO(r[6]))
  const numeroOc     = esc(r[7])
  const descripOc    = esc(r[8])
  const area         = esc(r[9])
  const areaFunc     = esc(r[10])
  const tipoServMat  = esc(r[11])
  const cargadoA     = esc(r[12])
  const descripFinal = esc(r[13])
  const centroCosto  = esc(r[14])
  const tipoCompra   = esc(r[15])
  const numFact      = esc(r[17])
  const fechaFact    = esc(excelDateToISO(r[18]))
  const valorTotal   = num(r[19])
  const valRetenido  = num(r[21])
  const valPagar     = num(r[22])
  const banco        = esc(r[23])
  const tipoPago     = esc(r[24])
  const mesPago      = esc(r[26])
  const abono        = num(r[27])
  const saldo        = num(r[28])
  const diasCred     = int(r[29])
  const fechaVenc    = esc(excelDateToISO(r[30]))
  const estado       = esc(r[31])

  rowsComp.push(
    `${item}, ${fechaNp}, ${numeroNp}, ${proveedor}, ${fechaOc}, ${numeroOc}, ${descripOc}, ` +
    `${area}, ${areaFunc}, ${tipoServMat}, ${cargadoA}, ${descripFinal}, ${centroCosto}, ${tipoCompra}, ` +
    `${numFact}, ${fechaFact}, ${valorTotal}, ${valRetenido}, ${valPagar}, ` +
    `${banco}, ${tipoPago}, ${mesPago}, ${abono}, ${saldo}, ${diasCred}, ${fechaVenc}, ${estado}`
  )
}

const colsComp = [
  'item','fecha_np','numero_np','proveedor','fecha_oc','numero_oc','descripcion_oc',
  'area','area_funcional','tipo_servicio_material','cargado_a','descripcion_final',
  'centro_costo','tipo_compra','numero_factura','fecha_factura',
  'valor_total','valor_retenido','valor_a_pagar',
  'banco','tipo_pago','mes_pago','abono','saldo','dias_credito','fecha_vencimiento','estado'
]

const sqlComp = `-- REQSYS — Seed Registro de Compras
-- Generado: ${new Date().toISOString()}
-- Fuente: REGISTRO_COMPRAS.xlsx → "2025 2026 (2)"
-- Total registros: ${rowsComp.length}

TRUNCATE TABLE registro_compras RESTART IDENTITY CASCADE;

${buildInserts('registro_compras', colsComp, rowsComp)}
`

fs.writeFileSync(path.join(OUTPUT_DIR, 'seed-compras.sql'), sqlComp)
console.log(`  ✓ seed-compras.sql — ${rowsComp.length} registros`)

console.log('\nListo. Archivos en scripts/output/')
console.log('Pasos siguientes:')
console.log('  1. Ejecutar supabase-schema-historico.sql en Supabase SQL Editor')
console.log('  2. Ejecutar scripts/output/seed-inventario.sql')
console.log('  3. Ejecutar scripts/output/seed-compras.sql')
