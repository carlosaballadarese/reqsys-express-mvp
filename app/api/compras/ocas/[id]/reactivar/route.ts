import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

// Spec: HU-018 RN-02, CA-10 — solo gerencia/admin reactivan
const ROLES_REACTIVAR = ['gerencia', 'admin']

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_REACTIVAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const { data: oca, error } = await adminClient()
      .from('oca').select('id, estado').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (oca.estado !== 'suspendida') {
      return NextResponse.json({ error: 'Solo se puede reactivar una OCA suspendida' }, { status: 409 })
    }

    await adminClient().from('oca').update({ estado: 'vigente', motivo_suspension: null }).eq('id', id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'vigente', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: 'OCA reactivada',
    })

    await registrarAuditoria({ accion: 'reactivar_oca', entidad: 'oca', entidad_id: id })

    return NextResponse.json({ estado: 'vigente' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
