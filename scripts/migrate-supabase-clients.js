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

function migrate(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')

  // Skip if already migrated
  if (src.includes("from '@/lib/supabase/clients'")) return false

  // Does it use supabase/supabaseAdmin at module level?
  const hasAdmin = /^const supabaseAdmin = createClient\(/m.test(src)
  const hasAnon  = /^const supabase = createClient\(/m.test(src)

  if (!hasAdmin && !hasAnon) return false

  // 1. Remove `import { createClient } from '@supabase/supabase-js'`
  //    (may have other named imports — keep them, just drop createClient)
  src = src.replace(/import \{ createClient \} from '@supabase\/supabase-js'\n/g, '')
  src = src.replace(/import \{ createClient, ([^}]+)\} from '@supabase\/supabase-js'\n/g,
    "import { $1} from '@supabase/supabase-js'\n")
  src = src.replace(/import \{ ([^}]+), createClient \} from '@supabase\/supabase-js'\n/g,
    "import { $1} from '@supabase/supabase-js'\n")

  // 2. Remove top-level const supabaseAdmin / supabase blocks (3 lines each)
  src = src.replace(
    /^const supabaseAdmin = createClient\(\n\s+process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\n\s+process\.env\.SUPABASE_SERVICE_ROLE_KEY!\n\)\n/m,
    ''
  )
  src = src.replace(
    /^const supabase = createClient\(\n\s+process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\n\s+process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY!\n\)\n/m,
    ''
  )

  // 3. Add import from clients.ts right after the last existing import block
  const importLine = buildImportLine(hasAdmin, hasAnon)
  // Insert after the last import line
  src = src.replace(/((?:^import [^\n]+\n)+)/m, `$1${importLine}\n`)

  // 4. Replace usages
  if (hasAdmin) src = src.replace(/\bsupabaseAdmin\./g, 'adminClient().')
  if (hasAnon)  src = src.replace(/\bsupabase\./g, 'anonClient().')

  fs.writeFileSync(filePath, src, 'utf8')
  return true
}

function buildImportLine(admin, anon) {
  const names = []
  if (admin) names.push('adminClient')
  if (anon)  names.push('anonClient')
  return `import { ${names.join(', ')} } from '@/lib/supabase/clients'`
}

const files = getAllRouteFiles(API_DIR)
let migrated = 0
for (const f of files) {
  if (migrate(f)) {
    console.log('✓', path.relative(path.join(__dirname, '..'), f))
    migrated++
  }
}
console.log(`\nMigrated ${migrated}/${files.length} files.`)
