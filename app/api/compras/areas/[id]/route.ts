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

// Renombra y/o activa/desactiva un área — admin/compras. Sin DELETE físico:
// desactivar (activo:false) es la vía de retiro, igual que en coordinadores
// (RN-08) — `notas_pedido.area_id`/`coordinadores_area.area_id` referencian
// esta fila y un borrado físico las dejaría huérfanas.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params
    const { nombre, activo } = await req.json()

    const update: { nombre?: string; activo?: boolean } = {}
    if (typeof nombre === 'string') {
      const nombreLimpio = nombre.trim()
      if (!nombreLimpio) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombreLimpio
    }
    if (typeof activo === 'boolean') update.activo = activo

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('areas')
      .update(update)
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un área con ese nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
