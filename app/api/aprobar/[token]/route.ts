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

    // Si fue aprobada, preparar y enviar email a Compras ANTES de actualizar estado
    if (esAprobada) {
      const [{ data: compras }, { data: aprobador }, { data: items }] = await Promise.all([
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', 'Compras').single(),
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', np.area).single(),
        anonClient().from('items_np').select('linea, codigo, descripcion, unidad, cantidad, precio_unitario, total').eq('nota_pedido_id', np.id).order('linea'),
      ])

      if (compras) {
        const tablaItems = (items ?? []).map(item =>
          `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 12px">${item.linea}</td>
            <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#64748b">${item.codigo || '—'}</td>
            <td style="padding:8px 12px">${item.descripcion}</td>
            <td style="padding:8px 12px;text-align:center">${item.cantidad} ${item.unidad}</td>
            <td style="padding:8px 12px;text-align:right">$${Number(item.precio_unitario).toFixed(2)}</td>
            <td style="padding:8px 12px;text-align:right">$${Number(item.total).toFixed(2)}</td>
          </tr>`
        ).join('')

        // Email obligatorio — si falla, no se aprueba
        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: compras.email,
          subject: `[REQSYS] NP Aprobada — ${np.numero}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#334155">
              <h2 style="color:#1e40af">Nueva NP Aprobada</h2>
              <p>La Nota de Pedido <strong>${np.numero}</strong> ha sido aprobada y requiere su gestión de compras.</p>
              
              <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin:20px 0">
                <p style="margin:5px 0"><strong>Área:</strong> ${np.area}</p>
                <p style="margin:5px 0"><strong>Solicitante:</strong> ${np.solicitante_nombre}</p>
                <p style="margin:5px 0"><strong>Total Est.:</strong> $${Number(np.total_estimado).toFixed(2)}</p>
              </div>

              <p>Por favor, ingrese al sistema para procesar este requerimiento:</p>
              
              <p style="text-align:center;margin:30px 0">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/compras/${np.id}" style="background:#1e40af;color:white;padding:12px 25px;text-decoration:none;border-radius:4px;font-weight:bold">
                  Gestionar Requerimiento
                </a>
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
              <p style="font-size:12px;color:#94a3b8;text-align:center">
                REQSYS — ARLIFT S.A.
              </p>
            </div>
          `,
        })
      }
    }

    // Email al solicitante — obligatorio
    await transporter.sendMail({
      from: 'One ARLIFT <one.arlift@arlift.com.ec>',
      to: np.solicitante_email,
      subject: `[REQSYS] Tu NP ${np.numero} fue ${esAprobada ? 'aprobada' : 'rechazada'}`,
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:0 auto">
          <div style="background:${esAprobada ? '#16a34a' : '#dc2626'};padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">
              ${esAprobada ? '✓ Nota de Pedido Aprobada' : '✗ Nota de Pedido Rechazada'}
            </h1>
            <p style="color:${esAprobada ? '#bbf7d0' : '#fecaca'};margin:4px 0 0">${np.numero}</p>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0">
            <p>Hola <strong>${np.solicitante_nombre}</strong>,</p>
            <p>Tu Nota de Pedido <strong>${np.numero}</strong> del área <strong>${np.area}</strong> ha sido <strong>${esAprobada ? 'aprobada' : 'rechazada'}</strong>.</p>
            ${!esAprobada && motivo_rechazo ? `
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin-top:16px">
                <p style="margin:0 0 8px;font-weight:600;color:#dc2626">Motivo de rechazo:</p>
                <p style="margin:0">${escapeHtml(motivo_rechazo)}</p>
              </div>
            ` : ''}
            ${esAprobada ? '<p style="color:#15803d">Tu requerimiento continuará el proceso de compras.</p>' : ''}
          </div>
          <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">
            REQSYS — ARLIFT S.A. · Sistema de Gestión de Requerimientos
          </div>
        </div>
      `,
    })

    // Emails enviados OK — ahora actualizar estado en BD
    const { error: errorUpdate } = await anonClient()
      .from('notas_pedido')
      .update({
        estado: nuevoEstado,
        motivo_rechazo: accion === 'rechazar' ? motivo_rechazo : null,
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
