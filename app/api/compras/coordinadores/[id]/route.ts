import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarDependenciasActivasCoordinador } from '@/lib/np-area'

async function verificarAdminOCompras() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  return perfil && ['admin', 'compras'].includes(perfil.rol) ? user : null
}

// Spec: SC-002 CA-10 — acepta `activo` (toggle activar/desactivar) además de
// area_id (re-resuelve el nombre real para la columna legado), nombre, email.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params
    const { area_id, nombre, email, activo } = await req.json()
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

    const { error } = await adminClient()
      .from('coordinadores_area')
      .update({
        area:    area.nombre,
        area_id: area.id,
        nombre:  nombre.trim(),
        email:   email.trim().toLowerCase(),
        ...(typeof activo === 'boolean' ? { activo } : {}),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// Spec: SC-002 CA-11/RN-08 — bloquea el DELETE físico (409) si el coordinador
// tiene dependencias activas; desactivarlo (PUT con activo:false) es la vía
// normal de retiro, que no pasa por este chequeo.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params

  const { bloqueado, motivos } = await verificarDependenciasActivasCoordinador(id)
  if (bloqueado) {
    return NextResponse.json(
      { error: 'No se puede eliminar: tiene dependencias activas', motivos },
      { status: 409 }
    )
  }

  const { error } = await adminClient()
    .from('coordinadores_area')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
