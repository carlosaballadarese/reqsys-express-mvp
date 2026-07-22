// Trae una copia de los datos de negocio de PRODUCCIÓN hacia el Supabase LOCAL
// (Docker), para tener datos realistas al desarrollar/probar sin arriesgar producción.
//
// - Es de SOLO LECTURA contra producción (pg_dump) — nunca escribe ni borra nada ahí.
// - Excluye `perfiles` y `auditoria` (identidad de personas reales) a propósito.
// - Anula las columnas que son FK reales a `auth.users` (asignado_a, creado_por_id,
//   accion_marcada_por) porque esas cuentas no existen en el Supabase local — se
//   sigue usando siempre los 7 usuarios de prueba de `seed-local-dev.mjs` para login.
// - El dump de datos reales se escribe en el directorio temporal del SO (nunca
//   dentro del repo) y se borra automáticamente al terminar, se cancele o falle.
//
// Requiere: `npx supabase login` + `npx supabase link` ya hechos una vez (por el
// usuario, en su propia terminal — ver CLAUDE.md), Docker Desktop corriendo, y el
// stack local levantado (`npx supabase start`).
//
// Uso: node scripts/pull-prod-data.mjs

import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CONTAINER = 'supabase_db_express-mvp'
const REFERENCIA_A_LIMPIAR = [
  'coordinadores_area', 'feriados', 'acciones_gestion',
  'proveedores', 'np_secuencia', 'oc_secuencia', 'configuracion_empresa',
]

function psql(sql) {
  const res = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', sql], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (res.status !== 0) throw new Error(`psql falló (exit ${res.status}) para: ${sql.slice(0, 60)}...`)
}

function psqlFromFile(path) {
  const contenido = readFileSync(path)
  const res = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'], {
    input: contenido,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (res.status !== 0) throw new Error(`Carga del dump falló (exit ${res.status})`)
}

function dockerContainerCorriendo() {
  const res = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER])
  return res.status === 0 && res.stdout.toString().trim() === 'true'
}

async function main() {
  if (!dockerContainerCorriendo()) {
    console.error(`❌ El contenedor ${CONTAINER} no está corriendo. Ejecuta primero: npx supabase start`)
    process.exit(1)
  }

  const dir = mkdtempSync(join(tmpdir(), 'reqsys-prod-pull-'))
  const dumpPath = join(dir, 'prod_data_dump.sql')

  try {
    console.log('1/4 — Descargando datos reales de producción (solo lectura, pg_dump)...')
    execSync(
      `npx supabase db dump --data-only --linked --schema public --exclude public.perfiles --exclude public.auditoria -f "${dumpPath}"`,
      { stdio: 'inherit' }
    )

    console.log('\n2/4 — Limpiando datos de catálogo/negocio locales antes de cargar los reales...')
    psql(`TRUNCATE TABLE ${REFERENCIA_A_LIMPIAR.join(', ')} RESTART IDENTITY CASCADE;`)
    psql('TRUNCATE TABLE historial_np, items_oc, items_np, registro_compras, notas_pedido, inventario RESTART IDENTITY CASCADE;')

    console.log('\n3/4 — Cargando datos reales en el ambiente local...')
    psqlFromFile(dumpPath)

    console.log('\n4/4 — Anulando referencias a usuarios reales (asignado_a, creado_por_id, accion_marcada_por)...')
    psql('UPDATE notas_pedido SET asignado_a = NULL, creado_por_id = NULL;')
    psql('UPDATE items_np SET accion_marcada_por = NULL;')
    psql('UPDATE registro_compras SET creado_por_id = NULL;')

    console.log('\n✅ Listo. Datos de negocio de producción cargados en el Supabase local.')
    console.log('   Login sigue siendo con los 7 usuarios de prueba de seed-local-dev.mjs.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch(err => { console.error('\n❌ ERROR:', err.message); process.exit(1) })
