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

// Spec: SC-002 — incluye area_id/activo; area (texto) se mantiene como legado.
export async function GET() {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error } = await adminClient()
    .from('coordinadores_area')
    .select('id, area, area_id, nombre, email, activo')
    .order('area')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Spec: SC-002 — el body exige area_id (existente, activa). La creación de
// áreas vive en su propio CRUD (`POST /api/compras/areas`) — este endpoint solo
// selecciona; el nombre real se persiste también en la columna legado (RN-06).
export async function POST(req: NextRequest) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { area_id, nombre, email } = await req.json()
    if (!area_id || !nombre || !email) {
      return NextResponse.json({ error: 'área, nombre y email son requeridos' }, { status: 400 })
    }

    const { data: area } = await adminClient()
      .from('areas')
      .select('id, nombre')
      .eq('id', area_id)
      .eq('activo', true)
      .maybeSingle()

    if (!area) {
      return NextResponse.json({ error: 'Área inválida o inactiva' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('coordinadores_area')
      .insert({
        area:    area.nombre,
        area_id: area.id,
        nombre:  nombre.trim(),
        email:   email.trim().toLowerCase(),
      })
      .select('id, area, area_id, nombre, email, activo')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
