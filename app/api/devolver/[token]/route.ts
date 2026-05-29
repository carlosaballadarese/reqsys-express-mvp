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
    const { motivo_devolucion } = await req.json()

    if (!motivo_devolucion?.trim()) {
      return NextResponse.json({ error: 'El motivo de devolución es requerido' }, { status: 400 })
    }

    // Buscar la NP por token_aprobacion (el mismo token del email de compras)
    const { data: np, error } = await anonClient()
      .from('notas_pedido')
      .select('*')
      .eq('token_devolucion', token)
      .eq('estado', 'aprobada')
      .single()

    if (error || !np) {
      return NextResponse.json(
        { error: 'NP no encontrada o no está en estado aprobada' },
        { status: 404 }
      )
    }

    // Actualizar estado a devuelta
    const { error: errorUpdate } = await anonClient()
      .from('notas_pedido')
      .update({
        estado: 'devuelta',
        motivo_devolucion: motivo_devolucion.trim(),
      })
      .eq('id', np.id)

    if (errorUpdate) {
      return NextResponse.json({ error: 'Error al actualizar la NP' }, { status: 500 })
    }

    // Registrar en historial
    const { data: coordinadorCompras } = await anonClient()
      .from('coordinadores_area')
      .select('nombre, email')
      .eq('area', 'Compras')
      .single()

    await adminClient().from('historial_np').insert({
      np_id: np.id,
      estado: 'devuelta',
      actor_email: coordinadorCompras?.email ?? null,
      actor_nombre: coordinadorCompras?.nombre ?? null,
      notas: `Devuelta por Compras: ${motivo_devolucion}`,
    })

    // Enviar email al solicitante con link para editar
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const urlEditar = `${baseUrl}/editar/${np.token_edicion}`

    try {
      await transporter.sendMail({
        from: 'One ARLIFT <one.arlift@arlift.com.ec>',
        to: np.solicitante_email,
        subject: `[REQSYS] Tu NP ${np.numero} requiere correcciones`,
        text: `Hola ${np.solicitante_nombre},\n\nEl área de Compras ha devuelto tu Nota de Pedido ${np.numero} para que realices las correcciones necesarias.\n\nMotivo de devolución: ${motivo_devolucion}\n\nCorregir aquí: ${urlEditar}\n\nREQSYS — ARLIFT S.A.`,
        html: `
          <p>Hola <strong>${np.solicitante_nombre}</strong>,</p>
          <p>El área de Compras ha devuelto tu Nota de Pedido <strong>${np.numero}</strong> para que realices las correcciones necesarias.</p>
          <p><strong>Motivo de devolución:</strong> ${escapeHtml(motivo_devolucion)}</p>
          <p><a href="${urlEditar}">CORREGIR NOTA DE PEDIDO</a></p>
          <p>REQSYS — ARLIFT S.A.</p>
        `,
      })
    } catch (err) {
      console.error('Error enviando email de devolución:', err)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
