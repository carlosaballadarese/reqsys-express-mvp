import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'


export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol, nombre, activo')
    .eq('id', user.id)
    .single()

  if (!perfil) return NextResponse.json({ error: 'Sin perfil' }, { status: 403 })

  return NextResponse.json({
    id:     user.id,
    email:  user.email,
    nombre: perfil.nombre,
    rol:    perfil.rol,
    activo: perfil.activo,
  })
}
