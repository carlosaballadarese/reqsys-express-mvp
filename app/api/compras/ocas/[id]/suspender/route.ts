import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

// Spec: HU-018 RN-02, CA-10 — solo gerencia/admin suspenden
const ROLES_SUSPENDER = ['gerencia', 'admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_SUSPENDER.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const motivo = (body?.motivo ?? '').trim()
    if (!motivo) return NextResponse.json({ error: 'El motivo de suspensión es requerido' }, { status: 400 })

    const { id } = await params
    const { data: oca, error } = await adminClient()
      .from('oca').select('id, estado').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (oca.estado !== 'vigente') {
      return NextResponse.json({ error: 'Solo se puede suspender una OCA vigente' }, { status: 409 })
    }

    await adminClient().from('oca').update({ estado: 'suspendida', motivo_suspension: motivo }).eq('id', id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'suspendida', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: `OCA suspendida. Motivo: ${motivo}`,
    })

    await registrarAuditoria({ accion: 'suspender_oca', entidad: 'oca', entidad_id: id })

    return NextResponse.json({ estado: 'suspendida' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
