import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_CON_PRECIO } from '@/lib/np-precio'

// Variante autenticada de /api/compras/inventario/search: incluye
// costo_unitario para el autocompletado de precio en NP/OC. La ruta pública
// (usada por /editar/[token]) nunca devuelve este campo — es dato sensible
// de negocio y no debe ser visible sin sesión ni para roles sin permiso de
// precio (mismo criterio que puedeVerPrecioNP).
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()
  const rol = perfil?.rol ?? ''
  const puedeVerPrecio = ROLES_CON_PRECIO.includes(rol)

  const raw = req.nextUrl.searchParams.get('q')?.trim()
  if (!raw || raw.length < 2) return NextResponse.json([])

  const q = raw.replace(/[%(),.]/g, ' ').trim()
  if (q.length < 2) return NextResponse.json([])

  const { data, error } = await adminClient()
    .from('inventario')
    .select('id, codigo, descripcion, costo_unitario, saldo_existencias, categoria')
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
    .limit(10)

  if (error) {
    console.error('inventario/search-interno error:', error)
    return NextResponse.json([], { status: 500 })
  }

  const resultado = puedeVerPrecio
    ? data
    : (data ?? []).map(item => ({ ...item, costo_unitario: 0 }))

  return NextResponse.json(resultado)
}
