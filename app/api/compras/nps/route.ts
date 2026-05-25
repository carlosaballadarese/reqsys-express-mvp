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

    // 5. Enviar email al coordinador
    const tablaItemsHtml = items.map((item: {
      codigo: string; descripcion: string; cantidad: number; unidad: string; precio_unitario: number
    }, i: number) => `
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
        text: `Nueva NP ${numero}\nSolicitante: ${encabezado.solicitante_nombre}\nArea: ${encabezado.area}\nTotal: $${totalEstimado.toFixed(2)}\n\nIngrese al sistema REQSYS para gestionar esta solicitud.`,
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

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let emailFiltro:    string | null   = null
    let areasFiltro:    string[] | null = null
    let asistenteId:    string | null   = null  // UUID del asistente_compras autenticado
    let rolActual:      string          = ''

    if (user) {
      const { data: perfil } = await adminClient()
        .from('perfiles')
        .select('rol, email')
        .eq('id', user.id)
        .single()

      rolActual = perfil?.rol ?? ''

      if (perfil?.rol === 'solicitante') {
        emailFiltro = perfil.email
      }

      if (perfil?.rol === 'coordinador') {
        const { data: coords } = await adminClient()
          .from('coordinadores_area')
          .select('area')
          .eq('email', perfil.email)
        areasFiltro = coords?.map(c => c.area) ?? []
      }

      // Spec: asistente_compras ve sus NPs propias + las asignadas a él
      if (perfil?.rol === 'asistente_compras') {
        emailFiltro = perfil.email
        asistenteId = user.id
      }
    }

    const SELECT = 'id, numero, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, estado, total_estimado, convertida, created_at, descripcion_general, asignado_a, asignado_nombre, asignado_email'

    // Asistente: OR(propias por email, asignadas por UUID)
    if (asistenteId) {
      let query = adminClient()
        .from('notas_pedido')
        .select(SELECT)
        .or(`solicitante_email.eq.${emailFiltro},asignado_a.eq.${asistenteId}`)
        .order('created_at', { ascending: false })

      if (estado && estado !== 'todos') query = query.eq('estado', estado)
      if (area   && area   !== 'todas') query = query.eq('area', area)
      if (q) query = query.or(`numero.ilike.%${q}%,solicitante_nombre.ilike.%${q}%`)

      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Marcar origen para diferenciación visual en el frontend
      const enriched = (data ?? []).map((np: any) => ({
        ...np,
        origen: np.asignado_a === asistenteId ? 'asignada' : 'propia',
      }))
      return NextResponse.json(enriched)
    }

    let query = adminClient()
      .from('notas_pedido')
      .select(SELECT)
      .order('created_at', { ascending: false })

    if (emailFiltro) query = query.eq('solicitante_email', emailFiltro)
    if (areasFiltro !== null) {
      if (areasFiltro.length === 0) return NextResponse.json([])
      query = query.in('area', areasFiltro)
    }

    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    if (area   && area   !== 'todas') query = query.eq('area', area)
    if (q) query = query.or(`numero.ilike.%${q}%,solicitante_nombre.ilike.%${q}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
