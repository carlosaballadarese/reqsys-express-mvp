import { NextRequest, NextResponse } from 'next/server'
import { transporter } from '@/lib/mailer'
import { adminClient, anonClient } from '@/lib/supabase/clients'



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
    const { data: np, error } = await supabase
      .from('notas_pedido')
      .select('*')
      .eq('token_aprobacion', token)
      .eq('estado', 'aprobada')
      .single()

    if (error || !np) {
      return NextResponse.json(
        { error: 'NP no encontrada o no está en estado aprobada' },
        { status: 404 }
      )
    }

    // Actualizar estado a devuelta
    const { error: errorUpdate } = await supabase
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
    const { data: coordinadorCompras } = await supabase
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

    await transporter.sendMail({
      from: 'REQSYS <reqsys.cabe@gmail.com>',
      to: np.solicitante_email,
      subject: `[REQSYS] Tu NP ${np.numero} requiere correcciones`,
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:0 auto">
          <div style="background:#d97706;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">⚠ Nota de Pedido devuelta para corrección</h1>
            <p style="color:#fef3c7;margin:4px 0 0">${np.numero}</p>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0">
            <p>Hola <strong>${np.solicitante_nombre}</strong>,</p>
            <p>El área de Compras ha devuelto tu Nota de Pedido <strong>${np.numero}</strong> para que realices las correcciones necesarias.</p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px;margin:16px 0">
              <p style="margin:0 0 8px;font-weight:600;color:#92400e">Motivo de devolución:</p>
              <p style="margin:0;color:#78350f">${motivo_devolucion}</p>
            </div>
            <p>Haz clic en el botón para revisar y corregir tu solicitud:</p>
            <a href="${urlEditar}" style="display:block;background:#1e40af;color:white;padding:14px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;margin-top:16px">
              ✏ Corregir Nota de Pedido
            </a>
            <p style="margin-top:16px;font-size:13px;color:#64748b">Una vez corregida, el coordinador de tu área recibirá nuevamente la solicitud para aprobación.</p>
          </div>
          <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">
            REQSYS — ARLIFT S.A. · Sistema de Gestión de Requerimientos
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
