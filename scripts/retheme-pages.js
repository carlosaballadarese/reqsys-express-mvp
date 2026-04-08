const fs   = require('fs')
const path = require('path')

const PAGES_DIR = path.join(__dirname, '..', 'app', 'compras')

function getAllTsx(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...getAllTsx(full))
    else if (entry.name.endsWith('.tsx') && entry.name !== 'ComprasNav.tsx') files.push(full)
  }
  return files
}

function retheme(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')
  const original = src

  // Headers de página: bg-blue-800 → page-header (clase CSS global)
  src = src.replace(/className="bg-blue-800 text-white/g, 'className="page-header')

  // Botones primarios: bg-blue-700 hover:bg-blue-800 → btn-primary (quitar hover de Tailwind)
  src = src.replace(/bg-blue-700 hover:bg-blue-800/g, 'btn-primary')
  src = src.replace(/bg-blue-700 hover:bg-blue-900/g, 'btn-primary')

  // Botones blancos sobre header: text-blue-800 → text-[#0d2e2e]
  src = src.replace(/bg-white text-blue-800 hover:bg-blue-50/g, 'bg-white text-[#0d2e2e] hover:bg-slate-50')

  // Botón Buscar y similares standalone
  src = src.replace(/className="h-9 bg-blue-700 hover:bg-blue-800"/g, 'className="h-9 btn-primary"')
  src = src.replace(/className="h-8 bg-blue-700 hover:bg-blue-800 text-sm"/g, 'className="h-8 btn-primary text-sm"')

  // Filtros activos año en dashboard
  src = src.replace(/bg-blue-700 text-white border-blue-700/g, "bg-[#1a5252] text-white border-[#1a5252]")
  src = src.replace(/hover:border-blue-400/g, 'hover:border-teal-400')

  if (src === original) return false
  fs.writeFileSync(filePath, src, 'utf8')
  return true
}

const files = getAllTsx(PAGES_DIR)
let fixed = 0
for (const f of files) {
  if (retheme(f)) {
    console.log('✓', path.relative(path.join(__dirname, '..'), f))
    fixed++
  }
}
console.log(`\nRethemed ${fixed} files.`)
