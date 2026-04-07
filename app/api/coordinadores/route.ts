import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

async function verificarAdminOCompras() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  return perfil && ['admin', 'compras'].includes(perfil.rol) ? user : null
}

export async function GET() {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error } = await adminClient()
    .from('coordinadores_area')
    .select('id, area, nombre, email')
    .order('area')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { area, nombre, email } = await req.json()
    if (!area || !nombre || !email) {
      return NextResponse.json({ error: 'área, nombre y email son requeridos' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('coordinadores_area')
      .insert({ area: area.trim(), nombre: nombre.trim(), email: email.trim().toLowerCase() })
      .select('id, area, nombre, email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
