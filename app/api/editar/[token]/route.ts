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
      from: 'REQSYS <reqsys.cabe@gmail.com>',
      to: coordinador.email,
      subject: `[REQSYS] NP Corregida ${np.numero} — ${encabezado.area}`,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#1e40af;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">Nota de Pedido Corregida</h1>
            <p style="color:#bfdbfe;margin:4px 0 0">${np.numero} — requiere tu aprobación nuevamente</p>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0">
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:6px 0;color:#64748b;width:160px">Solicitante</td><td style="font-weight:600">${encabezado.solicitante_nombre}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Email</td><td>${encabezado.solicitante_email}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Área</td><td>${encabezado.area}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Prioridad</td><td style="text-transform:capitalize">${encabezado.prioridad}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Tipo de Compra</td><td style="text-transform:capitalize">${encabezado.tipo_compra}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Centro de Costo</td><td style="text-transform:capitalize">${encabezado.centro_costo}</td></tr>
            </table>
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:20px">
              <p style="margin:0 0 8px;color:#64748b;font-size:13px">DESCRIPCIÓN GENERAL</p>
              <p style="margin:0">${encabezado.descripcion_general}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px">
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
                  <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1e40af">$${totalEstimado.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <div style="display:flex;gap:12px;margin-top:24px">
              <a href="${urlAprobar}" style="flex:1;display:block;background:#16a34a;color:white;padding:14px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">
                ✓ Aprobar NP
              </a>
              <a href="${urlRechazar}" style="flex:1;display:block;background:#dc2626;color:white;padding:14px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">
                ✗ Rechazar NP
              </a>
            </div>
          </div>
          <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">
            REQSYS — ARLIFT S.A. · Sistema de Gestión de Requerimientos
          </div>
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
