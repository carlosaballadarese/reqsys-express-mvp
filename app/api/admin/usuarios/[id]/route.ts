import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


async function verificarAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  return perfil?.rol === 'admin' ? user : null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verificarAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id }                         = await params
    const { nombre, rol, activo, email } = await req.json()

    if (!nombre || !rol || !email) {
      return NextResponse.json({ error: 'nombre, rol y email son requeridos' }, { status: 400 })
    }

    // 1. Actualizar en Supabase Auth si el email cambió
    const { data: perfilOriginal } = await adminClient()
      .from('perfiles').select('email').eq('id', id).single()

    if (perfilOriginal?.email !== email) {
      const { error: authError } = await adminClient().auth.admin.updateUserById(id, { email })
      if (authError) return NextResponse.json({ error: `Error Auth: ${authError.message}` }, { status: 500 })
    }

    // 2. Actualizar en tabla perfiles
    const { error } = await adminClient()
      .from('perfiles')
      .update({ nombre, rol, email, activo: activo !== false })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'editar_usuario',
      entidad:    'usuario',
      entidad_id: id,
      referencia: email,
      detalle:    { nombre, rol, email, activo: activo !== false },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verificarAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params

    // 1. Obtener email para auditoría antes de borrar
    const { data: perfil } = await adminClient()
      .from('perfiles').select('email').eq('id', id).single()

    // 2. Borrar de Supabase Auth (esto borra en cascada si hay FKs, pero perfiles es manual usualmente)
    const { error: authError } = await adminClient().auth.admin.deleteUser(id)
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    // 3. Borrar de tabla perfiles (por si no hubo cascada)
    await adminClient().from('perfiles').delete().eq('id', id)

    await registrarAuditoria({
      accion:     'eliminar_usuario',
      entidad:    'usuario',
      entidad_id: id,
      referencia: perfil?.email ?? id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verificarAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id }       = await params
    const { password } = await req.json()

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const { error } = await adminClient().auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('email').eq('id', id).single()

    await registrarAuditoria({
      accion:     'reset_password',
      entidad:    'usuario',
      entidad_id: id,
      referencia: perfil?.email ?? id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
