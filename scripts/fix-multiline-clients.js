// Reemplaza identificadores `supabase` y `supabaseAdmin` residuales
// (los que quedaron sin reemplazar por el script anterior porque estaban
//  al final de línea antes del encadenamiento .method())
const fs   = require('fs')
const path = require('path')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

function getAllRouteFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...getAllRouteFiles(full))
    else if (entry.name === 'route.ts') files.push(full)
  }
  return files
}

function fix(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')
  const original = src

  // Reemplazar TODAS las ocurrencias del identificador (con o sin dot en la misma línea)
  // Orden importante: primero el más largo para evitar match parcial
  src = src.replace(/\bsupabaseAdmin\b/g, 'adminClient()')
  src = src.replace(/\bsupabase\b/g, 'anonClient()')

  // Limpiar doble paréntesis accidentales como adminClient()() que surgirían
  // si el script anterior ya reemplazó `supabaseAdmin.` → `adminClient().`
  // y ahora volvería a procesar `adminClient` → `adminClient()`.
  // Eso no pasa porque ya no hay `supabaseAdmin` en el texto tras el primer script.
  // Pero sí puede quedar `anonClient()()` si `anonClient()` ya existía.
  src = src.replace(/\bAdminClient\(\)\(\)/g, 'adminClient()')
  src = src.replace(/\banonClient\(\)\(\)/g, 'anonClient()')

  // Ajustar imports: si usa adminClient() pero no está importado, agregarlo
  const needsAdmin = src.includes('adminClient()')
  const needsAnon  = src.includes('anonClient()')
  const hasClientsImport = src.includes("from '@/lib/supabase/clients'")

  if ((needsAdmin || needsAnon) && !hasClientsImport) {
    const names = []
    if (needsAdmin) names.push('adminClient')
    if (needsAnon)  names.push('anonClient')
    const importLine = `import { ${names.join(', ')} } from '@/lib/supabase/clients'\n`
    src = src.replace(/((?:^import [^\n]+\n)+)/m, `$1${importLine}`)
  } else if (hasClientsImport) {
    // Actualizar el import existente para que incluya todos los que se necesitan
    src = src.replace(
      /import \{ ([^}]+) \} from '@\/lib\/supabase\/clients'/,
      (_, existing) => {
        const current = existing.split(',').map((s) => s.trim()).filter(Boolean)
        if (needsAdmin && !current.includes('adminClient')) current.push('adminClient')
        if (needsAnon  && !current.includes('anonClient'))  current.push('anonClient')
        // Remover los que ya no se usan
        const filtered = current.filter(name => {
          if (name === 'adminClient') return needsAdmin
          if (name === 'anonClient')  return needsAnon
          return true
        })
        return `import { ${filtered.join(', ')} } from '@/lib/supabase/clients'`
      }
    )
  }

  if (src === original) return false
  fs.writeFileSync(filePath, src, 'utf8')
  return true
}

const files = getAllRouteFiles(API_DIR)
let fixed = 0
for (const f of files) {
  if (fix(f)) {
    console.log('✓', path.relative(path.join(__dirname, '..'), f))
    fixed++
  }
}
console.log(`\nFixed ${fixed} files.`)
