import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verificarAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabaseAdmin
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
    const { id }                  = await params
    const { nombre, rol, activo } = await req.json()

    if (!nombre || !rol) {
      return NextResponse.json({ error: 'nombre y rol son requeridos' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('perfiles')
      .update({ nombre, rol, activo: activo !== false })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
