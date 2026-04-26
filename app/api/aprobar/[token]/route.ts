import { NextRequest, NextResponse } from 'next/server'
import { transporter } from '@/lib/mailer'
import { adminClient, anonClient } from '@/lib/supabase/clients'



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
          from: 'REQSYS <reqsys.cabe@gmail.com>',
          to: compras.email,
          subject: `[REQSYS] NP Aprobada — ${np.numero} · ${np.area}`,
          html: `
            <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
              <div style="background:#1e40af;padding:24px;border-radius:8px 8px 0 0">
                <h1 style="color:white;margin:0;font-size:20px">Nueva NP para gestión de compras</h1>
                <p style="color:#bfdbfe;margin:4px 0 0">${np.numero} — Aprobada</p>
              </div>
              <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0">
                <p>Hola <strong>${compras.nombre}</strong>,</p>
                <p>La Nota de Pedido <strong>${np.numero}</strong> fue aprobada y requiere tu gestión.</p>

                <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                  <tr><td style="padding:6px 0;color:#64748b;width:160px">Área solicitante</td><td style="font-weight:600">${np.area}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Prioridad</td><td style="text-transform:capitalize">${np.prioridad}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Tipo de Compra</td><td style="text-transform:capitalize">${np.tipo_compra}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Centro de Costo</td><td style="text-transform:capitalize">${np.centro_costo}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Total Estimado</td><td style="font-weight:700;color:#1e40af">$${Number(np.total_estimado).toFixed(2)}</td></tr>
                </table>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
                  <div style="background:white;padding:14px;border-radius:6px;border:1px solid #e2e8f0">
                    <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase">Solicitado por</p>
                    <p style="margin:0;font-weight:600">${np.solicitante_nombre}</p>
                    <p style="margin:2px 0 0;color:#64748b;font-size:13px">${np.solicitante_email}</p>
                  </div>
                  <div style="background:white;padding:14px;border-radius:6px;border:1px solid #e2e8f0">
                    <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase">Aprobado por</p>
                    <p style="margin:0;font-weight:600">${aprobador?.nombre ?? 'Coordinador'}</p>
                    <p style="margin:2px 0 0;color:#64748b;font-size:13px">${aprobador?.email ?? ''}</p>
                  </div>
                </div>

                <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:20px">
                  <p style="margin:0 0 8px;color:#64748b;font-size:13px">DESCRIPCIÓN GENERAL</p>
                  <p style="margin:0">${np.descripcion_general}</p>
                </div>

                <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
                  <thead>
                    <tr style="background:#f1f5f9">
                      <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">#</th>
                      <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">Código</th>
                      <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">Descripción</th>
                      <th style="padding:10px 12px;text-align:center;font-size:13px;color:#64748b">Cantidad</th>
                      <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b">P. Unit.</th>
                      <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b">Total</th>
                    </tr>
                  </thead>
                  <tbody>${tablaItems}</tbody>
                  <tfoot>
                    <tr style="background:#f8fafc">
                      <td colspan="5" style="padding:10px 12px;text-align:right;font-weight:600">Total Estimado</td>
                      <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1e40af">$${Number(np.total_estimado).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div style="margin-top:24px">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/devolver/${np.token_devolucion}" style="display:block;background:#d97706;color:white;padding:14px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">
                    ↩ Devolver al solicitante para corrección
                  </a>
                </div>
              </div>
              <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">
                REQSYS — ARLIFT S.A. · Sistema de Gestión de Requerimientos
              </div>
            </div>
          `,
        })
      }
    }

    // Email al solicitante — obligatorio
    await transporter.sendMail({
      from: 'REQSYS <reqsys.cabe@gmail.com>',
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
                <p style="margin:0">${motivo_rechazo}</p>
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
