import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const estado  = searchParams.get('estado')
    const area    = searchParams.get('area')
    const q       = searchParams.get('q')?.trim()

    // Leer sesión para determinar si es solicitante
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let emailFiltro: string | null = null

    if (user) {
      const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, email')
        .eq('id', user.id)
        .single()

      if (perfil?.rol === 'solicitante') {
        emailFiltro = perfil.email
      }
    }

    let query = supabaseAdmin
      .from('notas_pedido')
      .select('id, numero, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, estado, total_estimado, convertida, created_at, descripcion_general')
      .order('created_at', { ascending: false })

    // Solicitante solo ve sus propias NPs
    if (emailFiltro) query = query.eq('solicitante_email', emailFiltro)

    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    if (area   && area   !== 'todas') query = query.eq('area', area)
    if (q) query = query.or(`numero.ilike.%${q}%,solicitante_nombre.ilike.%${q}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
