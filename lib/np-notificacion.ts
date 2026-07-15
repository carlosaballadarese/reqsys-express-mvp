import { anonClient, adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'

export type ItemEmailNP = {
  codigo: string | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
}

export type EncabezadoEmailNP = {
  solicitante_nombre: string
  solicitante_email: string
  area: string
  prioridad: string
  tipo_compra: string
  centro_costo: string
  descripcion_general: string
  es_regularizacion: boolean
  fecha_provision?: string | null
}

// Spec: HU-009 CA-01/CA-13/CA-14 — extraído de POST /api/compras/nps para
// reutilizarse también desde POST /api/compras/nps/[id]/enviar-aprobacion
// (una NP en Borrador se envía más tarde, sin volver a pasar por el formulario).
export async function enviarNPACoordinador(
  np_id: string,
  numero: string,
  encabezado: EncabezadoEmailNP,
  items: ItemEmailNP[],
  totalEstimado: number
): Promise<{ ok: boolean; error?: string }> {
  const { data: coordinador, error: errorCoord } = await anonClient()
    .from('coordinadores_area')
    .select('nombre, email')
    .eq('area', encabezado.area)
    .single()

  if (errorCoord || !coordinador) {
    return { ok: false, error: 'No se encontró coordinador para el área seleccionada' }
  }

  const filaRegularizacion = encabezado.es_regularizacion
    ? `<tr><td style="padding:5px 0;color:#64748b;width:140px">Regularización</td><td style="font-weight:600;color:#b45309">Sí — Provisión: ${encabezado.fecha_provision}</td></tr>`
    : ''

  const tablaItemsHtml = items.map((item, i) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 10px">${i + 1}</td>
      <td style="padding:6px 10px;font-family:monospace;font-size:12px">${item.codigo || '-'}</td>
      <td style="padding:6px 10px">${item.descripcion}</td>
      <td style="padding:6px 10px;text-align:center">${item.cantidad} ${item.unidad}</td>
      <td style="padding:6px 10px;text-align:right">$${(item.precio_unitario || 0).toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right">$${(item.cantidad * (item.precio_unitario || 0)).toFixed(2)}</td>
    </tr>`).join('')

  try {
    await transporter.sendMail({
      from: 'One ARLIFT <one.arlift@arlift.com.ec>',
      to: coordinador.email,
      subject: `REQSYS Nueva NP ${numero} - ${encabezado.area}`,
      text: `Nueva NP ${numero}\nSolicitante: ${encabezado.solicitante_nombre}\nArea: ${encabezado.area}\nTotal: $${totalEstimado.toFixed(2)}${encabezado.es_regularizacion ? '\nRegularización: Sí' : ''}\n\nIngrese al sistema REQSYS para gestionar esta solicitud.`,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
          <div style="background:#1e40af;padding:20px 24px;border-radius:6px 6px 0 0">
            <p style="color:white;margin:0;font-size:18px;font-weight:bold">Nueva Nota de Pedido</p>
            <p style="color:#bfdbfe;margin:4px 0 0">${numero}</p>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;background:#f8fafc">
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
              <tr><td style="padding:5px 0;color:#64748b;width:140px">Solicitante</td><td style="font-weight:600">${encabezado.solicitante_nombre}</td></tr>
              <tr><td style="padding:5px 0;color:#64748b">Email</td><td>${encabezado.solicitante_email}</td></tr>
              <tr><td style="padding:5px 0;color:#64748b">Area</td><td>${encabezado.area}</td></tr>
              <tr><td style="padding:5px 0;color:#64748b">Prioridad</td><td style="text-transform:capitalize">${encabezado.prioridad}</td></tr>
              <tr><td style="padding:5px 0;color:#64748b">Tipo de Compra</td><td style="text-transform:capitalize">${encabezado.tipo_compra}</td></tr>
              <tr><td style="padding:5px 0;color:#64748b">Centro de Costo</td><td style="text-transform:capitalize">${encabezado.centro_costo}</td></tr>
              ${filaRegularizacion}
            </table>
            <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:12px;margin-bottom:16px">
              <p style="margin:0 0 4px;color:#64748b;font-size:12px;text-transform:uppercase">Descripcion General</p>
              <p style="margin:0">${encabezado.descripcion_general}</p>
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
                  <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1e40af">$${totalEstimado.toFixed(2)}</td>
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
  } catch (emailErr) {
    console.error('ERROR SMTP (ignorado):', emailErr)
  }

  await adminClient().from('historial_np').insert({
    np_id,
    estado: 'pendiente',
    actor_email: encabezado.solicitante_email,
    actor_nombre: encabezado.solicitante_nombre,
    notas: 'NP creada y enviada para aprobación',
  })

  return { ok: true }
}
