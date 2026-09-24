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

// Spec: SC-002 CA-04/CA-09 — lista los coordinadores registrados como
// aprobador alternativo de esta área (independientemente de si están
// activos o no — el CRUD de coordinadores/page.tsx necesita verlos todos
// para poder gestionarlos; el formulario de NP filtra por activo por su
// cuenta vía lib/np-area.ts::listarAlternativosActivos()).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id: areaId } = await params

  const { data, error } = await adminClient()
    .from('area_aprobadores_alternativos')
    .select('id, coordinador_id, coordinadores_area(id, nombre, email, activo)')
    .eq('area_id', areaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Spec: SC-002 CA-09 — registra un coordinador como aprobador alternativo
// de esta área. No exige que el coordinador esté activo al registrarlo
// (puede activarse después); el filtro por activo aplica recién al listar
// alternativos disponibles para una NP.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id: areaId } = await params
    const { coordinador_id } = await req.json()
    if (!coordinador_id) {
      return NextResponse.json({ error: 'coordinador_id es requerido' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('area_aprobadores_alternativos')
      .insert({ area_id: areaId, coordinador_id })
      .select('id, area_id, coordinador_id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Este coordinador ya es alternativo de esta área' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// Spec: SC-002 — quita un coordinador de la lista de alternativos de esta
// área (?coordinador_id=). No elimina el coordinador en sí.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id: areaId } = await params
  const coordinadorId = req.nextUrl.searchParams.get('coordinador_id')
  if (!coordinadorId) {
    return NextResponse.json({ error: 'coordinador_id es requerido' }, { status: 400 })
  }

  const { error } = await adminClient()
    .from('area_aprobadores_alternativos')
    .delete()
    .eq('area_id', areaId)
    .eq('coordinador_id', coordinadorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
