import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

// Spec: HU-018 RN-01 — solo compras/admin envían la OCA a aprobación
const ROLES_ENVIAR = ['compras', 'admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, email').eq('id', user.id).single()
    if (!perfil || !ROLES_ENVIAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: oca, error } = await adminClient()
      .from('oca').select('id, estado').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (oca.estado !== 'borrador') {
      return NextResponse.json({ error: 'Solo se puede enviar a aprobación una OCA en borrador' }, { status: 409 })
    }

    // Spec: HU-018 RN-06 — requiere al menos 1 ítem y 1 área habilitada
    const { data: items } = await adminClient().from('oca_items').select('id').eq('oca_id', id)
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'La OCA debe tener al menos un ítem en su lista de precios' }, { status: 400 })
    }

    const { data: areas } = await adminClient().from('oca_areas_habilitadas').select('id').eq('oca_id', id)
    if (!areas || areas.length === 0) {
      return NextResponse.json({ error: 'La OCA debe tener al menos un área habilitada' }, { status: 400 })
    }

    await adminClient().from('oca').update({ estado: 'en_aprobacion' }).eq('id', id)

    await adminClient().from('historial_oca').insert({
      oca_id: id,
      estado: 'en_aprobacion',
      actor_email: perfil.email,
      actor_nombre: perfil.rol,
      notas: 'OCA enviada a aprobación',
    })

    await registrarAuditoria({ accion: 'enviar_aprobacion_oca', entidad: 'oca', entidad_id: id })

    return NextResponse.json({ estado: 'en_aprobacion' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
