import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'


async function generarNumeroNP(): Promise<string> {
  const year = new Date().getFullYear()
  const { data, error } = await adminClient().rpc('siguiente_numero_np', { p_year: year })
  if (error || data === null) throw new Error('Error al generar número de NP')
  return `NP-${year}-${String(data).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const { encabezado, items } = body

    // 1. Buscar coordinador del área
    const { data: coordinador, error: errorCoord } = await anonClient()
      .from('coordinadores_area')
      .select('nombre, email')
      .eq('area', encabezado.area)
      .single()

    if (errorCoord || !coordinador) {
      return NextResponse.json(
        { error: 'No se encontró coordinador para el área seleccionada' },
        { status: 400 }
      )
    }

    // 2. Calcular total estimado
    const totalEstimado = items.reduce(
      (acc: number, item: { cantidad: number; precio_unitario: number }) =>
        acc + item.cantidad * (item.precio_unitario || 0),
      0
    )

    // 3. Insertar NP
    const numero = await generarNumeroNP()
    const { data: np, error: errorNP } = await anonClient()
      .from('notas_pedido')
      .insert({
        numero,
        solicitante_nombre: encabezado.solicitante_nombre,
        solicitante_email: encabezado.solicitante_email,
        area: encabezado.area,
        prioridad: encabezado.prioridad,
        tipo_compra: encabezado.tipo_compra,
        centro_costo: encabezado.centro_costo,
        descripcion_general: encabezado.descripcion_general,
        total_estimado: totalEstimado,
      })
      .select()
      .single()

    if (errorNP || !np) {
      return NextResponse.json({ error: 'Error al guardar la NP' }, { status: 500 })
    }

    // 4. Insertar ítems
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

    const { error: errorItems } = await anonClient().from('items_np').insert(itemsConNP)

    if (errorItems) {
      return NextResponse.json({ error: 'Error al guardar los ítems' }, { status: 500 })
    }

    // 5. Construir tabla de ítems para el email
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

    // 6. Enviar email al coordinador (no bloquea si falla)
    try {
      await transporter.sendMail({
        from: 'One ARLIFT <one.arlift@arlift.com.ec>',
        to: coordinador.email,
        subject: `[REQSYS] Nueva Nota de Pedido ${numero} — ${encabezado.area}`,
        html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#334155">
          <h2 style="color:#1e40af">Nueva Nota de Pedido</h2>
          <p>Se ha registrado un nuevo requerimiento que requiere su revisión:</p>
          
          <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin:20px 0">
            <p style="margin:5px 0"><strong>Número:</strong> ${numero}</p>
            <p style="margin:5px 0"><strong>Solicitante:</strong> ${encabezado.solicitante_nombre}</p>
            <p style="margin:5px 0"><strong>Área:</strong> ${encabezado.area}</p>
            <p style="margin:5px 0"><strong>Prioridad:</strong> ${encabezado.prioridad}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">#</th>
                <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">Código</th>
                <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b">Descripción</th>
                <th style="padding:10px 12px;text-align:center;font-size:13px;color:#64748b">Cant.</th>
                <th style="padding:10px 12px;text-align:right;font-size:13px;color:#64748b">Total</th>
              </tr>
            </thead>
            <tbody>${tablaItems}</tbody>
            <tfoot>
              <tr style="background:#f8fafc">
                <td colspan="4" style="padding:10px 12px;text-align:right;font-weight:600">Total Estimado</td>
                <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1e40af">$${totalEstimado.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

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

          <p style="font-size:13px;color:#64748b;text-align:center">O si lo prefiere, <a href="${baseUrl}/compras/${np.id}" style="color:#1e40af">ver detalle completo en el sistema</a>.</p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
          <p style="font-size:12px;color:#94a3b8;text-align:center">
            REQSYS — ARLIFT S.A.
          </p>
        </div>
      `,
      })
    } catch (emailErr) {
      console.error('Error al enviar email de NP:', emailErr)
    }

    await adminClient().from('historial_np').insert({
      np_id: np.id,
      estado: 'pendiente',
      actor_email: encabezado.solicitante_email,
      actor_nombre: encabezado.solicitante_nombre,
      notas: 'NP creada y enviada para aprobación',
    })

    return NextResponse.json({ success: true, numero, id: np.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const estado  = searchParams.get('estado')
    const area    = searchParams.get('area')
    const q       = searchParams.get('q')?.trim()

    // Leer sesión para determinar si es solicitante
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let emailFiltro: string | null = null

    if (user) {
      const { data: perfil } = await adminClient()
        .from('perfiles')
        .select('rol, email')
        .eq('id', user.id)
        .single()

      if (perfil?.rol === 'solicitante') {
        emailFiltro = perfil.email
      }
    }

    let query = adminClient()
      .from('notas_pedido')
      .select('id, numero, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, estado, total_estimado, convertida, created_at, descripcion_general')
      .order('created_at', { ascending: false })

    // Solicitante solo ve sus propias NPs
    if (emailFiltro) query = query.eq('solicitante_email', emailFiltro)

    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    if (area   && area   !== 'todas') query = query.eq('area', area)
    if (q) query = query.or(`numero.ilike.%${q}%,solicitante_nombre.ilike.%${q}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
