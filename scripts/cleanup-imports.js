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

function cleanup(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')
  const original = src

  // 1. Eliminar líneas con import corrompido (path con anonClient)
  src = src.replace(/^import \{[^}]+\} from '@\/lib\/anonClient\(\)\/clients'\n/gm, '')

  // 2. Determinar qué funciones se usan realmente
  const needsAdmin = src.includes('adminClient()')
  const needsAnon  = src.includes('anonClient()')

  // 3. Actualizar el import correcto para que refleje lo que se usa
  if (needsAdmin || needsAnon) {
    const names = []
    if (needsAdmin) names.push('adminClient')
    if (needsAnon)  names.push('anonClient')
    src = src.replace(
      /import \{[^}]+\} from '@\/lib\/supabase\/clients'/,
      `import { ${names.join(', ')} } from '@/lib/supabase/clients'`
    )
  }

  if (src === original) return false
  fs.writeFileSync(filePath, src, 'utf8')
  return true
}

const files = getAllRouteFiles(API_DIR)
let fixed = 0
for (const f of files) {
  if (cleanup(f)) {
    console.log('✓', path.relative(path.join(__dirname, '..'), f))
    fixed++
  }
}
console.log(`\nCleaned ${fixed} files.`)
