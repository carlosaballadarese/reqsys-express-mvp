import { NextRequest, NextResponse } from 'next/server'
import { transporter } from '@/lib/mailer'
import { adminClient } from '@/lib/supabase/clients'
import { escapeHtml } from '@/lib/utils'


// Cliente con service role para operaciones que requieren bypass de RLS

// GET — cargar NP + items para pre-llenar el formulario
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Hallazgo real de seguridad (2026-11-02): select('*') devolvía la fila
    // completa de notas_pedido al cliente, incluidos token_aprobacion y
    // token_devolucion — cualquiera con el link de edición podía leerlos en
    // la respuesta JSON y aprobar/devolver su propia NP saltándose al
    // coordinador. Select explícito: solo los campos que la UI usa.
    const { data: np, error } = await adminClient()
      .from('notas_pedido')
      .select('id, numero, motivo_devolucion, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, descripcion_general')
      .eq('token_edicion', token)
      .eq('estado', 'devuelta')
      .single()

    if (error || !np) {
      return NextResponse.json({ error: 'NP no encontrada o no está disponible para edición' }, { status: 404 })
    }

    // Spec CA-14: select ampliado — fecha_requerida y proveedor_sugerido incluidos
    // precio_unitario devuelto sin masking (token actúa como prueba de identidad del creador)
    const { data: items } = await adminClient()
      .from('items_np')
      .select('linea, codigo, descripcion, unidad, cantidad, precio_unitario, fecha_requerida, proveedor_sugerido, informacion_adicional')
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

    // Verificar que la NP sigue en estado devuelta — select acotado a lo que
    // se usa server-side (id/numero para las operaciones, token_aprobacion
    // para armar el email de reenvío al coordinador); nunca se devuelve al
    // cliente, pero se evita seleccionar de más por el mismo motivo del GET.
    const { data: np, error } = await adminClient()
      .from('notas_pedido')
      .select('id, numero, token_aprobacion')
      .eq('token_edicion', token)
      .eq('estado', 'devuelta')
      .single()

    if (error || !np) {
      return NextResponse.json({ error: 'NP no encontrada o no está disponible para edición' }, { status: 404 })
    }

    // Buscar coordinador del área
    const { data: coordinador, error: errorCoord } = await adminClient()
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
    // Spec CA-14: campos de regularización actualizables desde el formulario público
    const esRegularizacion = encabezado.es_regularizacion === true
    const { error: errorUpdate } = await adminClient()
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
        es_regularizacion:                     esRegularizacion,
        fecha_provision:                       esRegularizacion ? (encabezado.fecha_provision ?? null) : null,
        proveedor_regularizacion_nombre:       esRegularizacion ? (encabezado.proveedor_regularizacion_nombre ?? null) : null,
        proveedor_regularizacion_identificacion: esRegularizacion ? (encabezado.proveedor_regularizacion_identificacion ?? null) : null,
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

    // Spec CA-14: fecha_requerida y proveedor_sugerido persistidos desde formulario público
    const itemsConNP = items.map((item: {
      codigo: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
      fecha_requerida?: string
      proveedor_sugerido?: string
    }, index: number) => ({
      nota_pedido_id:     np.id,
      linea:              index + 1,
      codigo:             item.codigo || null,
      descripcion:        item.descripcion,
      unidad:             item.unidad,
      cantidad:           item.cantidad,
      precio_unitario:    item.precio_unitario || 0,
      fecha_requerida:    item.fecha_requerida || null,
      proveedor_sugerido: item.proveedor_sugerido || null,
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
    try {
      await transporter.sendMail({
        from: 'One ARLIFT <notificaciones@mail.cabesoft.com>',
        to: coordinador.email,
        subject: `[REQSYS] NP Corregida ${np.numero} — ${encabezado.area}`,
        text: `Hola ${coordinador.nombre},\n\nLa Nota de Pedido ${np.numero} ha sido corregida por el solicitante y requiere su aprobación nuevamente.\n\nNúmero: ${np.numero}\nSolicitante: ${encabezado.solicitante_nombre}\nÁrea: ${encabezado.area}\n\nPara gestionar esta solicitud, use los siguientes enlaces:\n\nAPROBAR: ${urlAprobar}\nRECHAZAR: ${urlRechazar}\n\nREQSYS — ARLIFT S.A.`,
        html: `
          <p>Hola <strong>${escapeHtml(coordinador.nombre)}</strong>,</p>
          <p>La Nota de Pedido <strong>${np.numero}</strong> ha sido corregida por el solicitante y requiere su aprobación nuevamente.</p>
          <ul>
            <li><strong>Número:</strong> ${np.numero}</li>
            <li><strong>Solicitante:</strong> ${escapeHtml(encabezado.solicitante_nombre)}</li>
            <li><strong>Área:</strong> ${escapeHtml(encabezado.area)}</li>
          </ul>
          <p>Puede gestionar esta solicitud haciendo clic en los siguientes enlaces:</p>
          <p>
            <a href="${urlAprobar}">APROBAR ESTA NP</a><br><br>
            <a href="${urlRechazar}">RECHAZAR ESTA NP</a>
          </p>
          <p>REQSYS — ARLIFT S.A.</p>
        `,
      })
    } catch (err) {
      console.error('Error enviando email de corrección:', err)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
