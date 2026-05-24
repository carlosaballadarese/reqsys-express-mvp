import { NextRequest, NextResponse } from 'next/server'
import { transporter } from '@/lib/mailer'
import { adminClient, anonClient } from '@/lib/supabase/clients'


// Cliente con service role para operaciones que requieren bypass de RLS

// GET — cargar NP + items para pre-llenar el formulario
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const { data: np, error } = await anonClient()
      .from('notas_pedido')
      .select('*')
      .eq('token_edicion', token)
      .eq('estado', 'devuelta')
      .single()

    if (error || !np) {
      return NextResponse.json({ error: 'NP no encontrada o no está disponible para edición' }, { status: 404 })
    }

    const { data: items } = await anonClient()
      .from('items_np')
      .select('linea, codigo, descripcion, unidad, cantidad, precio_unitario')
      .eq('nota_pedido_id', np.id)
      .order('linea')

    return NextResponse.json({ np, items: items ?? [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST — guardar correcciones y reenviar al coordinador del área
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await req.json()
    const { encabezado, items } = body

    // Verificar que la NP sigue en estado devuelta
    const { data: np, error } = await anonClient()
      .from('notas_pedido')
      .select('*')
      .eq('token_edicion', token)
      .eq('estado', 'devuelta')
      .single()

    if (error || !np) {
      return NextResponse.json({ error: 'NP no encontrada o no está disponible para edición' }, { status: 404 })
    }

    // Buscar coordinador del área
    const { data: coordinador, error: errorCoord } = await anonClient()
      .from('coordinadores_area')
      .select('nombre, email')
      .eq('area', encabezado.area)
      .single()

    if (errorCoord || !coordinador) {
      return NextResponse.json({ error: 'No se encontró coordinador para el área seleccionada' }, { status: 400 })
    }

    // Recalcular total
    const totalEstimado = items.reduce(
      (acc: number, item: { cantidad: number; precio_unitario: number }) =>
        acc + item.cantidad * (item.precio_unitario || 0),
      0
    )

    // Actualizar encabezado de la NP y volver a pendiente
    const { error: errorUpdate } = await anonClient()
      .from('notas_pedido')
      .update({
        solicitante_nombre: encabezado.solicitante_nombre,
        solicitante_email: encabezado.solicitante_email,
        area: encabezado.area,
        prioridad: encabezado.prioridad,
        tipo_compra: encabezado.tipo_compra,
        centro_costo: encabezado.centro_costo,
        descripcion_general: encabezado.descripcion_general,
        total_estimado: totalEstimado,
        estado: 'pendiente',
        motivo_devolucion: null,
      })
      .eq('id', np.id)

    if (errorUpdate) {
      return NextResponse.json({ error: 'Error al actualizar la NP' }, { status: 500 })
    }

    // Reemplazar ítems usando admin para bypass de RLS
    const { error: errorDelete } = await adminClient()
      .from('items_np')
      .delete()
      .eq('nota_pedido_id', np.id)

    if (errorDelete) {
      console.error('Error al eliminar ítems:', errorDelete)
      return NextResponse.json({ error: 'Error al eliminar ítems anteriores' }, { status: 500 })
    }

    const itemsConNP = items.map((item: {
      codigo: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
    }, index: number) => ({
      nota_pedido_id: np.id,
      linea: index + 1,
      codigo: item.codigo || null,
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario || 0,
    }))

    const { error: errorInsert } = await adminClient().from('items_np').insert(itemsConNP)
    if (errorInsert) {
      console.error('Error al insertar ítems:', errorInsert)
      return NextResponse.json({ error: 'Error al guardar los ítems corregidos' }, { status: 500 })
    }

    // Construir tabla de ítems para el email
    const tablaItems = items
      .map((item: { codigo: string; descripcion: string; cantidad: number; unidad: string; precio_unitario: number }, i: number) =>
        `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:8px 12px">${i + 1}</td>
          <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#64748b">${item.codigo || '—'}</td>
          <td style="padding:8px 12px">${item.descripcion}</td>
          <td style="padding:8px 12px;text-align:center">${item.cantidad} ${item.unidad}</td>
          <td style="padding:8px 12px;text-align:right">$${(item.precio_unitario || 0).toFixed(2)}</td>
          <td style="padding:8px 12px;text-align:right">$${(item.cantidad * (item.precio_unitario || 0)).toFixed(2)}</td>
        </tr>`
      )
      .join('')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const urlAprobar = `${baseUrl}/aprobar/${np.token_aprobacion}?accion=aprobar`
    const urlRechazar = `${baseUrl}/aprobar/${np.token_aprobacion}?accion=rechazar`

    // Notificar al coordinador del área para nueva aprobación
    await transporter.sendMail({
      from: 'One ARLIFT <one.arlift@arlift.com.ec>',
      to: coordinador.email,
      subject: `[REQSYS] NP Corregida ${np.numero} — ${encabezado.area}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#334155">
          <h2 style="color:#1e40af">Nota de Pedido Corregida</h2>
          <p>El solicitante ha realizado las correcciones en la NP <strong>${np.numero}</strong> y requiere su aprobación:</p>
          
          <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin:20px 0">
            <p style="margin:5px 0"><strong>Número:</strong> ${np.numero}</p>
            <p style="margin:5px 0"><strong>Solicitante:</strong> ${encabezado.solicitante_nombre}</p>
            <p style="margin:5px 0"><strong>Área:</strong> ${encabezado.area}</p>
          </div>

          <p>Puede gestionar esta solicitud directamente con un solo clic:</p>
          
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0">
            <tr>
              <td align="center">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px" bgcolor="#16a34a">
                      <a href="${urlAprobar}" style="display:inline-block;padding:14px 24px;font-family:sans-serif;font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:6px">
                        Aprobar Nota de Pedido
                      </a>
                    </td>
                    <td style="width:20px"></td>
                    <td style="border-radius:6px" bgcolor="#dc2626">
                      <a href="${urlRechazar}" style="display:inline-block;padding:14px 24px;font-family:sans-serif;font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:6px">
                        Rechazar Nota de Pedido
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="text-align:center;margin:30px 0;font-size:14px">
            O si lo prefiere, <a href="${baseUrl}/compras/${np.id}" style="color:#1e40af;text-decoration:underline">ver detalle completo en el sistema</a>.
          </p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
          <p style="font-size:12px;color:#94a3b8;text-align:center">
            REQSYS — ARLIFT S.A.
          </p>
        </div>
      `,
    })

    await adminClient().from('historial_np').insert({
      np_id: np.id,
      estado: 'pendiente',
      actor_email: encabezado.solicitante_email,
      actor_nombre: encabezado.solicitante_nombre,
      notas: 'NP corregida y reenviada para aprobación',
    })

    return NextResponse.json({ success: true, numero: np.numero })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
