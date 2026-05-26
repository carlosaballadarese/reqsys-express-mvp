import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { transporter } from '@/lib/mailer'
import { registrarAuditoria } from '@/lib/auditoria'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', user.id)
      .single()

    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params
    const { accion, motivo } = await req.json()

    if (!['aprobar', 'rechazar'].includes(accion))
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('id, numero_oc, estado_oc, valor_total, proveedor, creado_por_id, creado_por_nombre')
      .eq('id', id)
      .single()

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    // Spec: rol aprobador depende del estado actual de la OC
    if (oc.estado_oc === 'en_aprobacion_compras') {
      if (!['compras', 'admin'].includes(perfil.rol))
        return NextResponse.json({ error: 'Esta OC requiere aprobación del rol Compras' }, { status: 403 })
    } else if (oc.estado_oc === 'en_aprobacion_gerencia') {
      if (!['gerencia', 'admin'].includes(perfil.rol))
        return NextResponse.json({ error: 'Esta OC requiere aprobación del rol Gerencia' }, { status: 403 })
    } else {
      return NextResponse.json({ error: 'La OC no está pendiente de aprobación' }, { status: 400 })
    }

    const nuevoEstado = accion === 'aprobar' ? 'aprobada' : 'rechazada'

    await adminClient()
      .from('registro_compras')
      .update({ estado_oc: nuevoEstado })
      .eq('id', id)

    // Notificar al creador de la OC
    try {
      if (oc.creado_por_id) {
        const { data: creador } = await adminClient()
          .from('perfiles').select('email, nombre').eq('id', oc.creado_por_id).single()
        if (creador) {
          const accionTexto = accion === 'aprobar' ? 'aprobada' : 'rechazada'
          await transporter.sendMail({
            from: 'One ARLIFT <one.arlift@arlift.com.ec>',
            to: creador.email,
            subject: `REQSYS OC ${oc.numero_oc} ${accionTexto}`,
            text: [
              `Estimado/a ${creador.nombre},`,
              '',
              `La Orden de Compra ${oc.numero_oc} ha sido ${accionTexto}.`,
              `Proveedor: ${oc.proveedor}`,
              `Total: $${Number(oc.valor_total).toFixed(2)}`,
              ...(motivo ? ['', `Notas: ${motivo}`] : []),
              `Revisado por: ${perfil.nombre}`,
              '',
              'Ingrese al sistema REQSYS para ver el detalle.',
              '',
              'REQSYS - ARLIFT S.A.',
            ].join('\n'),
          })
        }
      }
    } catch (emailErr) {
      console.error('ERROR SMTP (ignorado):', emailErr)
    }

    await registrarAuditoria({
      accion:     accion === 'aprobar' ? 'aprobar_oc' : 'rechazar_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: oc.numero_oc,
      detalle:    { estado_nuevo: nuevoEstado, motivo: motivo ?? null },
    })

    return NextResponse.json({ success: true, estado: nuevoEstado })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
