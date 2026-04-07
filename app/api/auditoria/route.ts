import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  // Solo admin y compras pueden ver la auditoría
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()

  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const usuario  = searchParams.get('usuario')?.trim()
  const accion   = searchParams.get('accion')
  const entidad  = searchParams.get('entidad')
  const desde    = searchParams.get('desde')
  const hasta    = searchParams.get('hasta')

  let query = adminClient()
    .from('auditoria')
    .select('id, created_at, usuario_email, usuario_nombre, rol, accion, entidad, referencia, detalle')
    .order('created_at', { ascending: false })
    .limit(500)

  if (usuario)  query = query.ilike('usuario_email', `%${usuario}%`)
  if (accion)   query = query.eq('accion', accion)
  if (entidad)  query = query.eq('entidad', entidad)
  if (desde)    query = query.gte('created_at', desde)
  if (hasta)    query = query.lte('created_at', hasta + 'T23:59:59')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
