import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: oc, error } = await supabaseAdmin
    .from('registro_compras')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

  const { data: items } = await supabaseAdmin
    .from('items_oc')
    .select('*')
    .eq('registro_compras_id', id)
    .order('linea')

  return NextResponse.json({ oc, items: items ?? [] })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body   = await req.json()

    const {
      proveedor, proveedor_id, fecha_oc, descripcion_oc,
      area, tipo_compra, centro_costo,
      numero_factura, fecha_factura,
      valor_total, valor_retenido,
      tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago,
      items,
    } = body

    if (!proveedor?.trim()) {
      return NextResponse.json({ error: 'El proveedor es requerido' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })
    }

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    const { error: errorOC } = await supabaseAdmin
      .from('registro_compras')
      .update({
        proveedor_id:      proveedor_id || null,
        proveedor,
        fecha_oc:          fecha_oc          || null,
        descripcion_oc:    descripcion_oc    || null,
        area:              area              || null,
        tipo_compra:       tipo_compra       || null,
        centro_costo:      centro_costo      || null,
        numero_factura:    numero_factura    || null,
        fecha_factura:     fecha_factura     || null,
        valor_total:       valorTotal,
        valor_retenido:    valorRetenido,
        valor_a_pagar:     valorTotal - valorRetenido,
        banco:             banco             || null,
        tipo_pago:         tipo_pago         || null,
        mes_pago:          mes_pago          || null,
        dias_credito:      Number(dias_credito) || 0,
        fecha_vencimiento: fecha_vencimiento || null,
      })
      .eq('id', id)

    if (errorOC) return NextResponse.json({ error: errorOC.message }, { status: 500 })

    // Reemplazar ítems
    await supabaseAdmin.from('items_oc').delete().eq('registro_compras_id', id)

    const itemsOC = items.map((item: {
      codigo: string; descripcion: string; unidad: string
      cantidad: number; precio_unitario: number
    }, index: number) => ({
      registro_compras_id: id,
      linea:               index + 1,
      codigo:              item.codigo || null,
      descripcion:         item.descripcion,
      unidad:              item.unidad,
      cantidad:            item.cantidad,
      precio_unitario:     item.precio_unitario || 0,
    }))

    const { error: errorItems } = await supabaseAdmin.from('items_oc').insert(itemsOC)
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
