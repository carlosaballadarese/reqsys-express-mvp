import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { transporter } from '@/lib/mailer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generarNumeroNP(): Promise<string> {
  const year = new Date().getFullYear()
  const { data, error } = await supabaseAdmin.rpc('siguiente_numero_np', { p_year: year })
  if (error || data === null) throw new Error('Error al generar número de NP')
  return `NP-${year}-${String(data).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { encabezado, items } = body

    // 1. Buscar coordinador del área
    const { data: coordinador, error: errorCoord } = await supabase
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
    const { data: np, error: errorNP } = await supabase
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

    const { error: errorItems } = await supabase.from('items_np').insert(itemsConNP)

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

    // 6. Enviar email al coordinador
    await transporter.sendMail({
      from: 'REQSYS <reqsys.cabe@gmail.com>',
      to: coordinador.email,
      subject: `[REQSYS] Nueva Nota de Pedido ${numero} — ${encabezado.area}`,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#1e40af;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">Nueva Nota de Pedido</h1>
            <p style="color:#bfdbfe;margin:4px 0 0">${numero}</p>
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
                  <td colspan="4" style="padding:10px 12px;text-align:right;font-weight:600">Total Estimado</td>
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
    await supabaseAdmin.from('historial_np').insert({
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

export async function GET() {
  const { data, error } = await supabase
    .from('notas_pedido')
    .select('id, numero, solicitante_nombre, area, prioridad, estado, total_estimado, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
