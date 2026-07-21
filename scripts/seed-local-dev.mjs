// Crea usuarios de prueba (uno por rol) en el Supabase LOCAL (Docker) vía Admin API,
// más su fila correspondiente en `perfiles`. No toca producción — usa siempre las
// claves fijas de desarrollo local que imprime `supabase start`.
//
// Uso: node scripts/seed-local-dev.mjs   (requiere `supabase start` ya corriendo)

import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'Test1234!'

const USUARIOS = [
  { email: 'solicitante@test.dev', nombre: 'Solicitante de Prueba', rol: 'solicitante' },
  { email: 'bodega@test.dev',      nombre: 'Bodega de Prueba',      rol: 'bodega' },
  { email: 'asistente1@test.dev',  nombre: 'Asistente Compras Uno', rol: 'asistente_compras' },
  { email: 'asistente2@test.dev',  nombre: 'Asistente Compras Dos', rol: 'asistente_compras' },
  { email: 'compras@test.dev',     nombre: 'Compras de Prueba',     rol: 'compras' },
  { email: 'gerencia@test.dev',    nombre: 'Gerencia de Prueba',    rol: 'gerencia' },
  { email: 'admin@test.dev',       nombre: 'Admin de Prueba',       rol: 'admin' },
]

async function main() {
  console.log(`Creando ${USUARIOS.length} usuarios de prueba en ${LOCAL_URL}...\n`)

  for (const u of USUARIOS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    })

    let userId
    if (error) {
      if (error.message?.includes('already been registered') || error.code === 'email_exists') {
        const { data: list } = await supabase.auth.admin.listUsers()
        const existente = list.users.find(x => x.email === u.email)
        userId = existente?.id
        console.log(`  ⚠️  ${u.email} ya existía — reutilizando`)
      } else {
        console.error(`  ❌ ${u.email}:`, error.message)
        continue
      }
    } else {
      userId = data.user.id
      console.log(`  ✅ ${u.email} creado (${userId})`)
    }

    if (!userId) continue

    const { error: errPerfil } = await supabase
      .from('perfiles')
      .upsert({ id: userId, email: u.email, nombre: u.nombre, rol: u.rol, activo: true })

    if (errPerfil) console.error(`     ❌ perfil ${u.email}:`, errPerfil.message)
  }

  console.log(`\nListo. Password para todos: ${PASSWORD}`)
}

main().catch(err => { console.error('ERROR FATAL:', err); process.exit(1) })
