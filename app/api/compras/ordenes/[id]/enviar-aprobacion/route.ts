import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { transporter } from '@/lib/mailer'
import { registrarAuditoria } from '@/lib/auditoria'
import { actualizarEstadoNP } from '@/lib/np-estado'

const UMBRAL_COMPRAS = 2000

export async function POST(
  _req: NextRequest,
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

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('id, numero_oc, estado_oc, valor_total, proveedor, area, creado_por_id, nota_pedido_id')
      .eq('id', id)
      .single()

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (oc.estado_oc !== 'en_proceso')
      return NextResponse.json({ error: 'Solo se pueden enviar a aprobación OCs en estado En Proceso' }, { status: 400 })

    // Spec: asistente solo puede enviar OCs que él generó
    if (perfil.rol === 'asistente_compras' && oc.creado_por_id !== user.id)
      return NextResponse.json({ error: 'Solo puedes enviar a aprobación OCs que tú generaste' }, { status: 403 })

    // Spec: umbral determina aprobador
    const valorTotal = Number(oc.valor_total) || 0
    const nuevoEstado = valorTotal <= UMBRAL_COMPRAS ? 'en_aprobacion_compras' : 'en_aprobacion_gerencia'
    const rolAprobador = valorTotal <= UMBRAL_COMPRAS ? 'compras' : 'gerencia'
    const etiquetaAprobador = valorTotal <= UMBRAL_COMPRAS ? 'Compras' : 'Gerencia'

    await adminClient()
      .from('registro_compras')
      .update({ estado_oc: nuevoEstado })
      .eq('id', id)

    // Spec: HU-009 CA-19 (Tarea 22) — recalcula el Estado de la NP tras enviar la OC a aprobación
    if (oc.nota_pedido_id) {
      await actualizarEstadoNP(oc.nota_pedido_id).catch(console.error)
    }

    // Notificar a todos los usuarios del rol aprobador
    try {
      const { data: aprobadores } = await adminClient()
        .from('perfiles')
        .select('nombre, email')
        .eq('rol', rolAprobador)
        .eq('activo', true)

      for (const aprobador of aprobadores ?? []) {
        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: aprobador.email,
          subject: `REQSYS OC ${oc.numero_oc} pendiente de aprobación`,
          text: [
            `Estimado/a ${aprobador.nombre},`,
            '',
            `La Orden de Compra ${oc.numero_oc} requiere su aprobación.`,
            `Proveedor: ${oc.proveedor}`,
            `Área: ${oc.area ?? '—'}`,
            `Total: $${valorTotal.toFixed(2)}`,
            `Enviada por: ${perfil.nombre}`,
            '',
            `Ingrese al sistema REQSYS para aprobar o rechazar.`,
            '',
            'REQSYS - ARLIFT S.A.',
          ].join('\n'),
        })
      }
    } catch (emailErr) {
      console.error('ERROR SMTP (ignorado):', emailErr)
    }

    await registrarAuditoria({
      accion:     'enviar_aprobacion_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: oc.numero_oc,
      detalle:    { estado_nuevo: nuevoEstado, aprobador: etiquetaAprobador, valor_total: valorTotal },
    })

    return NextResponse.json({ success: true, estado: nuevoEstado, aprobador: etiquetaAprobador })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
