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
      const [{ data: compras }, { data: aprobador }, { data: items }] = await Promise.all([
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', 'Compras').single(),
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', np.area).single(),
        anonClient().from('items_np').select('linea, codigo, descripcion, unidad, cantidad, precio_unitario, total').eq('nota_pedido_id', np.id).order('linea'),
      ])

      if (compras) {
        try {
          const tablaItemsHtml = (items ?? []).map(item => `
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:6px 10px">${item.linea}</td>
              <td style="padding:6px 10px;font-family:monospace;font-size:12px">${item.codigo || '-'}</td>
              <td style="padding:6px 10px">${item.descripcion}</td>
              <td style="padding:6px 10px;text-align:center">${item.cantidad} ${item.unidad}</td>
              <td style="padding:6px 10px;text-align:right">$${Number(item.precio_unitario).toFixed(2)}</td>
              <td style="padding:6px 10px;text-align:right">$${Number(item.total).toFixed(2)}</td>
            </tr>`).join('')

          await transporter.sendMail({
            from: 'One ARLIFT <one.arlift@arlift.com.ec>',
            to: compras.email,
            subject: `REQSYS NP Aprobada ${np.numero} - ${np.area}`,
            text: `NP Aprobada ${np.numero}\nArea: ${np.area}\nAprobada por: ${aprobador?.nombre ?? 'coordinador'}\nTotal: $${Number(np.total_estimado).toFixed(2)}\n\nIngrese al sistema REQSYS para gestionar esta solicitud.`,
            html: `
              <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
                <div style="background:#1e40af;padding:20px 24px;border-radius:6px 6px 0 0">
                  <p style="color:white;margin:0;font-size:18px;font-weight:bold">NP Aprobada para gestion de Compras</p>
                  <p style="color:#bfdbfe;margin:4px 0 0">${np.numero}</p>
                </div>
                <div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;background:#f8fafc">
                  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                    <tr><td style="padding:5px 0;color:#64748b;width:140px">Area</td><td style="font-weight:600">${np.area}</td></tr>
                    <tr><td style="padding:5px 0;color:#64748b">Prioridad</td><td style="text-transform:capitalize">${np.prioridad}</td></tr>
                    <tr><td style="padding:5px 0;color:#64748b">Tipo de Compra</td><td style="text-transform:capitalize">${np.tipo_compra}</td></tr>
                    <tr><td style="padding:5px 0;color:#64748b">Centro de Costo</td><td style="text-transform:capitalize">${np.centro_costo}</td></tr>
                    <tr><td style="padding:5px 0;color:#64748b">Total Estimado</td><td style="font-weight:700;color:#1e40af">$${Number(np.total_estimado).toFixed(2)}</td></tr>
                  </table>
                  <div style="display:flex;gap:12px;margin-bottom:16px">
                    <div style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:12px">
                      <p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase">Solicitado por</p>
                      <p style="margin:0;font-weight:600">${np.solicitante_nombre}</p>
                      <p style="margin:2px 0 0;color:#64748b;font-size:12px">${np.solicitante_email}</p>
                    </div>
                    <div style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:4px;padding:12px">
                      <p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase">Aprobado por</p>
                      <p style="margin:0;font-weight:600">${aprobador?.nombre ?? 'Coordinador'}</p>
                      <p style="margin:2px 0 0;color:#64748b;font-size:12px">${aprobador?.email ?? ''}</p>
                    </div>
                  </div>
                  <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:20px">
                    <thead>
                      <tr style="background:#f1f5f9">
                        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#64748b">#</th>
                        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#64748b">Codigo</th>
                        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#64748b">Descripcion</th>
                        <th style="padding:8px 10px;text-align:center;font-size:12px;color:#64748b">Cantidad</th>
                        <th style="padding:8px 10px;text-align:right;font-size:12px;color:#64748b">P. Unit.</th>
                        <th style="padding:8px 10px;text-align:right;font-size:12px;color:#64748b">Total</th>
                      </tr>
                    </thead>
                    <tbody>${tablaItemsHtml}</tbody>
                    <tfoot>
                      <tr style="background:#f8fafc">
                        <td colspan="5" style="padding:8px 10px;text-align:right;font-weight:600">Total Estimado</td>
                        <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1e40af">$${Number(np.total_estimado).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p style="margin:0;font-weight:600">Ingrese al sistema REQSYS para gestionar esta solicitud.</p>
                </div>
                <div style="padding:12px;text-align:center;color:#94a3b8;font-size:11px">
                  REQSYS - ARLIFT S.A. Sistema de Gestion de Requerimientos
                </div>
              </div>`,
          })
        } catch (err) {
          console.error('ERROR SMTP (ignorado):', err)
        }
      }
    }

    // Email al solicitante
    try {
      await transporter.sendMail({
        from: 'One ARLIFT <one.arlift@arlift.com.ec>',
        to: np.solicitante_email,
        subject: `REQSYS NP ${np.numero} ${esAprobada ? 'aprobada' : 'rechazada'}`,
        text: [
          `Estimado/a ${np.solicitante_nombre},`,
          '',
          `La Nota de Pedido ${np.numero} ha sido ${esAprobada ? 'aprobada' : 'rechazada'}.`,
          ...(!esAprobada && motivo_rechazo ? ['', `Motivo: ${motivo_rechazo}`] : []),
          '',
          'REQSYS - ARLIFT S.A.',
        ].join('\n'),
      })
    } catch (err) {
      console.error('ERROR SMTP (ignorado):', err)
    }

    // Actualizar estado en BD
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
