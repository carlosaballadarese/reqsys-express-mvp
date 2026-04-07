import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


async function verificarAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  return perfil?.rol === 'admin' ? user : null
}

export async function GET() {
  const admin = await verificarAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('perfiles')
    .select('id, email, nombre, rol, activo, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const admin = await verificarAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { email, nombre, rol, password } = await req.json()

    if (!email || !nombre || !rol || !password) {
      return NextResponse.json({ error: 'email, nombre, rol y password son requeridos' }, { status: 400 })
    }

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? 'Error al crear usuario' }, { status: 500 })
    }

    // Crear perfil
    const { error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .insert({ id: authData.user.id, email, nombre, rol, activo: true })

    if (perfilError) {
      // Revertir: eliminar el usuario auth si falla el perfil
      await adminClient().auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: perfilError.message }, { status: 500 })
    }

    await registrarAuditoria({
      accion:     'crear_usuario',
      entidad:    'usuario',
      entidad_id: authData.user.id,
      referencia: email,
      detalle:    { nombre, rol },
    })

    return NextResponse.json({ success: true, id: authData.user.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
