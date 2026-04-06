import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabaseAdmin
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
