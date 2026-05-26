import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'admin')
    return NextResponse.json({ error: 'Solo administradores pueden modificar la configuración de empresa' }, { status: 403 })

  try {
    const body = await req.json()
    const { razon_social, ruc, direccion, contacto, telefono, email } = body

    if (!razon_social?.trim())
      return NextResponse.json({ error: 'La razón social es requerida' }, { status: 400 })

    const { error } = await adminClient()
      .from('configuracion_empresa')
      .update({
        razon_social: razon_social.trim(),
        ruc:          ruc       || null,
        direccion:    direccion || null,
        contacto:     contacto  || null,
        telefono:     telefono  || null,
        email:        email     || null,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
