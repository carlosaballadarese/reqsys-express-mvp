import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno. Ejecuta: node --env-file=.env.local scripts/cargar-proveedores.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const wb = XLSX.readFile('c:/Users/CarlosBalladares/Documents/REQSYS/documents/data/Lista de Proveedores.xlsx')

// Usar la hoja consolidada
const sheetName = 'TODOS PROVEEDORES'
const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

const proveedores = []

for (const row of rows) {
  // Fila válida: primer campo es número, segundo es texto con nombre
  const num = row[0]
  const nombre = row[1]
  if (typeof num !== 'number' || !nombre || typeof nombre !== 'string') continue

  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) continue

  proveedores.push({
    nombre:        nombreLimpio,
    clasificacion: row[2] ? String(row[2]).trim() : null,
    categoria:     row[3] ? String(row[3]).trim() : null,
    ciudad:        row[5] ? String(row[5]).trim() : null,
    direccion:     row[6] ? String(row[6]).trim() : null,
    telefono:      row[9] ? String(row[9]).trim() : null,
    email:         row[10] ? String(row[10]).trim().toLowerCase() : null,
    contacto:      row[11] ? String(row[11]).trim() : null,
  })
}

console.log(`Proveedores encontrados: ${proveedores.length}`)

// Insertar en lotes de 100
const BATCH = 100
let insertados = 0
for (let i = 0; i < proveedores.length; i += BATCH) {
  const lote = proveedores.slice(i, i + BATCH)
  const { error } = await supabase.from('proveedores').insert(lote)
  if (error) {
    console.error(`Error en lote ${i}-${i + BATCH}:`, error.message)
  } else {
    insertados += lote.length
    console.log(`Insertados: ${insertados}/${proveedores.length}`)
  }
}

console.log('✓ Carga completada')
