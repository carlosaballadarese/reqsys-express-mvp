import { NextRequest, NextResponse } from 'next/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { transporter } from '@/lib/mailer'
import { escapeHtml } from '@/lib/utils'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [{ data: np, error }, { data: items }, { data: historial }] = await Promise.all([
      adminClient().from('notas_pedido').select('*').eq('id', id).single(),
      adminClient().from('items_np').select('*').eq('nota_pedido_id', id).order('linea'),
      adminClient().from('historial_np').select('*').eq('np_id', id).order('fecha', { ascending: true }),
    ])

    if (error || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    return NextResponse.json({ np, items: items ?? [], historial: historial ?? [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { accion, motivo } = await req.json()

    if (!['aprobar', 'rechazar', 'devolver'].includes(accion)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    // 1. Verificar permisos (Admin, Gerencia o Compras para devolver)
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    const puedeGestionar = perfil && ['admin', 'gerencia', 'compras'].includes(perfil.rol)
    if (!puedeGestionar) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    // 2. Buscar NP
    const { data: np, error: errorNP } = await adminClient().from('notas_pedido').select('*').eq('id', id).single()
    if (errorNP || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Validar estados
    if (accion === 'devolver' && np.estado !== 'aprobada') {
      return NextResponse.json({ error: 'Solo se pueden devolver NPs ya aprobadas' }, { status: 400 })
    }
    if ((accion === 'aprobar' || accion === 'rechazar') && np.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Solo se pueden procesar NPs pendientes' }, { status: 400 })
    }

    const nuevoEstado = accion === 'aprobar' ? 'aprobada' : (accion === 'rechazar' ? 'rechazada' : 'devuelta')
    const esAprobada = accion === 'aprobar'

    // 3. Si es APROBAR, enviar email a Compras
    if (esAprobada) {
      const [{ data: compras }, { data: items }] = await Promise.all([
        anonClient().from('coordinadores_area').select('nombre, email').eq('area', 'Compras').single(),
        anonClient().from('items_np').select('*').eq('nota_pedido_id', id).order('linea'),
      ])

      if (compras) {
        const tablaItems = (items ?? []).map(item =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.linea}</td><td style="padding:8px;border-bottom:1px solid #eee">${item.descripcion}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.cantidad} ${item.unidad}</td></tr>`
        ).join('')

        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: compras.email,
          subject: `[REQSYS] NP Aprobada — ${np.numero}`,
          html: `<p>Hola <strong>${compras.nombre}</strong>,</p><p>La NP ${np.numero} fue aprobada y requiere gestión.</p><table>${tablaItems}</table><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/compras/${id}">Ver detalle en el sistema</a></p>`
        })
      }
    }

    // 4. Email al solicitante
    let subject = `[REQSYS] Tu NP ${np.numero} fue ${nuevoEstado}`
    if (accion === 'devolver') subject = `[REQSYS] Tu NP ${np.numero} requiere correcciones`

    await transporter.sendMail({
      from: 'One ARLIFT <one.arlift@arlift.com.ec>',
      to: np.solicitante_email,
      subject,
      html: `
        <p>Hola <strong>${np.solicitante_nombre}</strong>,</p>
        <p>Tu NP <strong>${np.numero}</strong> ha pasado a estado <strong>${nuevoEstado}</strong>.</p>
        ${motivo ? `<p><strong>Motivo/Observaciones:</strong> ${escapeHtml(motivo)}</p>` : ''}
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/compras/${id}">Ver mi Nota de Pedido</a></p>
      `
    })

    // 5. Actualizar base de datos
    const updateData: any = { estado: nuevoEstado }
    if (accion === 'rechazar') updateData.motivo_rechazo = motivo
    if (accion === 'devolver') updateData.motivo_devolucion = motivo

    await adminClient().from('notas_pedido').update(updateData).eq('id', id)

    // Registrar historial
    await adminClient().from('historial_np').insert({
      np_id: id,
      estado: nuevoEstado,
      actor_email: perfil.email,
      actor_nombre: perfil.nombre,
      notas: motivo || (esAprobada ? 'Aprobada desde el portal' : `Acción: ${accion}`),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
