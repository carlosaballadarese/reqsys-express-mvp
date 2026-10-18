import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'
import { registrarAuditoria } from '@/lib/auditoria'

// Spec: HU-018 RN-02 — solo gerencia/admin aprueban o rechazan
const ROLES_APROBAR = ['gerencia', 'admin']

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
    if (!perfil || !ROLES_APROBAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const decision = body?.decision
    const motivo = (body?.motivo ?? '').trim()

    if (!['aprobar', 'rechazar'].includes(decision)) {
      return NextResponse.json({ error: "decision debe ser 'aprobar' o 'rechazar'" }, { status: 400 })
    }
    // Spec: HU-018 CA-06 — motivo obligatorio al rechazar
    if (decision === 'rechazar' && !motivo) {
      return NextResponse.json({ error: 'El motivo de rechazo es requerido' }, { status: 400 })
    }

    const { data: oca, error } = await adminClient()
      .from('oca').select('id, numero_oca, estado, creado_por_id').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (oca.estado !== 'en_aprobacion') {
      return NextResponse.json({ error: 'Solo se puede resolver una OCA en en_aprobacion' }, { status: 409 })
    }

    if (decision === 'aprobar') {
      await adminClient().from('oca').update({
        estado: 'vigente',
        aprobado_por_id: user.id,
        aprobado_en: new Date().toISOString(),
      }).eq('id', id)

      await adminClient().from('historial_oca').insert({
        oca_id: id, estado: 'vigente', actor_email: perfil.email, actor_nombre: perfil.nombre,
        notas: 'OCA aprobada',
      })

      await registrarAuditoria({ accion: 'aprobar_oca', entidad: 'oca', entidad_id: id, referencia: oca.numero_oca })

      return NextResponse.json({ estado: 'vigente' })
    }

    // decision === 'rechazar'
    await adminClient().from('oca').update({
      estado: 'borrador',
      motivo_rechazo: motivo,
    }).eq('id', id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'borrador', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: `OCA rechazada. Motivo: ${motivo}`,
    })

    await registrarAuditoria({ accion: 'rechazar_oca', entidad: 'oca', entidad_id: id, referencia: oca.numero_oca })

    // Spec: HU-018 CA-06 — notifica al creador (email texto plano, mismo patrón ya usado en NP)
    try {
      const { data: creador } = await adminClient()
        .from('perfiles').select('nombre, email').eq('id', oca.creado_por_id).single()

      if (creador?.email) {
        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: creador.email,
          subject: `REQSYS OCA ${oca.numero_oca} rechazada`,
          text: [
            `Estimado/a ${creador.nombre},`,
            '',
            `La Orden de Compra Abierta ${oca.numero_oca} fue rechazada por ${perfil.nombre}.`,
            `Motivo: ${motivo}`,
            '',
            'Ingrese al sistema REQSYS para corregirla y reenviarla.',
            '',
            'REQSYS - ARLIFT S.A.',
          ].join('\n'),
        })
      }
    } catch (mailErr) {
      console.error('Error al notificar rechazo de OCA:', mailErr)
    }

    return NextResponse.json({ estado: 'borrador' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
