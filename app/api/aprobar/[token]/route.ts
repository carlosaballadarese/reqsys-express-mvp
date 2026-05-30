import { NextRequest, NextResponse } from 'next/server'
import { transporter } from '@/lib/mailer'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { escapeHtml } from '@/lib/utils'



export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { accion, motivo_rechazo } = await req.json()

    if (!['aprobar', 'rechazar'].includes(accion)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    // Buscar la NP por token
    const { data: np, error } = await anonClient()
      .from('notas_pedido')
      .select('*')
      .eq('token_aprobacion', token)
      .eq('estado', 'pendiente')
      .single()

    if (error || !np) {
      return NextResponse.json(
        { error: 'NP no encontrada o ya fue procesada' },
        { status: 404 }
      )
    }

    const nuevoEstado = accion === 'aprobar' ? 'aprobada' : 'rechazada'
    const esAprobada  = accion === 'aprobar'

    // Obtener coordinador del área (actor de la acción)
    const { data: coordinadorArea } = await anonClient()
      .from('coordinadores_area')
      .select('nombre, email')
      .eq('area', np.area)
      .single()

    // Si fue aprobada, preparar y enviar email a Compras
    if (esAprobada) {
      const [{ data: compras }, { data: aprobador }] = await Promise.all([
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', 'Compras').single(),
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', np.area).single(),
      ])

      if (compras) {
        // Email a compras - Simplificado para evitar filtros
        try {
          await transporter.sendMail({
            from: 'One ARLIFT <one.arlift@arlift.com.ec>',
            to: compras.email,
            subject: `[REQSYS] NP Aprobada — ${np.numero} · ${np.area}`,
            text: `Hola ${compras.nombre},\n\nLa Nota de Pedido ${np.numero} fue aprobada por ${aprobador?.nombre ?? 'el coordinador'} y requiere tu gestión.\n\nDetalle: ${np.descripcion_general}\nTotal: $${Number(np.total_estimado).toFixed(2)}\n\nVer en el sistema: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compras/nps/${np.id}\n\nREQSYS — ARLIFT S.A.`,
            html: `
              <p>Hola <strong>${compras.nombre}</strong>,</p>
              <p>La Nota de Pedido <strong>${np.numero}</strong> fue aprobada por <strong>${aprobador?.nombre ?? 'el coordinador'}</strong> y requiere tu gestión.</p>
              <ul>
                <li><strong>Área:</strong> ${np.area}</li>
                <li><strong>Total:</strong> $${Number(np.total_estimado).toFixed(2)}</li>
                <li><strong>Descripción:</strong> ${np.descripcion_general}</li>
              </ul>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compras/nps/${np.id}">GESTIONAR EN EL SISTEMA</a></p>
              <p>REQSYS — ARLIFT S.A.</p>
            `,
          })
        } catch (err) {
          console.error('Error enviando email a compras:', err)
        }
      }
    }

    // Email al solicitante
    try {
      await transporter.sendMail({
        from: 'One ARLIFT <one.arlift@arlift.com.ec>',
        to: np.solicitante_email,
        subject: `[REQSYS] Tu NP ${np.numero} fue ${esAprobada ? 'aprobada' : 'rechazada'}`,
        text: `Hola ${np.solicitante_nombre},\n\nTu Nota de Pedido ${np.numero} ha sido ${esAprobada ? 'aprobada' : 'rechazada'}.\n\n${!esAprobada && motivo_rechazo ? `Motivo: ${motivo_rechazo}` : ''}\n\nVer en el sistema: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compras/nps/${np.id}\n\nREQSYS — ARLIFT S.A.`,
        html: `
          <p>Hola <strong>${np.solicitante_nombre}</strong>,</p>
          <p>Tu Nota de Pedido <strong>${np.numero}</strong> ha sido <strong>${esAprobada ? 'aprobada' : 'rechazada'}</strong>.</p>
          ${!esAprobada && motivo_rechazo ? `<p><strong>Motivo:</strong> ${escapeHtml(motivo_rechazo)}</p>` : ''}
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compras/nps/${np.id}">VER MI NOTA DE PEDIDO</a></p>
          <p>REQSYS — ARLIFT S.A.</p>
        `,
      })
    } catch (err) {
      console.error('Error enviando email al solicitante:', err)
    }

    // Actualizar estado en BD
    const { error: errorUpdate } = await anonClient()
      .from('notas_pedido')
      .update({
        estado: nuevoEstado,
        motivo_rechazo: accion === 'rechazar' ? motivo_rechazo : null,
        ...(esAprobada && {
          aprobador_np_nombre: coordinadorArea?.nombre ?? null,
          aprobador_np_area:   np.area,
        }),
      })
      .eq('id', np.id)

    if (errorUpdate) {
      return NextResponse.json({ error: 'Error al actualizar la NP' }, { status: 500 })
    }

    // Registrar en historial
    await adminClient().from('historial_np').insert({
      np_id: np.id,
      estado: nuevoEstado,
      actor_email: coordinadorArea?.email ?? null,
      actor_nombre: coordinadorArea?.nombre ?? null,
      notas: esAprobada ? 'NP aprobada por coordinador del área' : `Rechazada: ${motivo_rechazo ?? ''}`,
    })

    return NextResponse.json({ success: true, estado: nuevoEstado })
  } catch (err: unknown) {
    console.error(err)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    const smtpCodes = ['EAUTH', 'ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE']
    if (e?.code && smtpCodes.includes(e.code)) {
      return NextResponse.json({
        error: `No se pudo enviar el correo de notificación (${e.code}). La NP NO fue modificada. Por favor comuníquese con el Jefe de Compras para gestionar esta aprobación directamente.`,
      }, { status: 500 })
    }
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
