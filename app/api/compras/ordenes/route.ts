import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const estado   = searchParams.get('estado')
  const q        = searchParams.get('q')?.trim()
  const area     = searchParams.get('area')

  let query = adminClient()
    .from('registro_compras')
    .select('id, numero_oc, numero_np, proveedor, area, tipo_compra, valor_total, valor_a_pagar, estado_oc, fecha_oc, created_at')
    .order('created_at', { ascending: false })

  if (estado && estado !== 'todos') query = query.eq('estado_oc', estado)
  if (area   && area   !== 'todas') query = query.eq('area', area)
  if (q) query = query.or(`numero_oc.ilike.%${q}%,numero_np.ilike.%${q}%,proveedor.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const year = new Date().getFullYear()
    const { data: seqData, error: seqError } = await adminClient().rpc('siguiente_numero_oc', { p_year: year })
    if (seqError || seqData === null) {
      return NextResponse.json({ error: 'Error al generar número de OC' }, { status: 500 })
    }
    const numero_oc = `OC-${year}-${String(seqData).padStart(4, '0')}`

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

    const { data: oc, error: errorOC } = await adminClient()
      .from('registro_compras')
      .insert({
        proveedor_id:      proveedor_id || null,
        proveedor,
        numero_oc,
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
        estado_oc:         'en_proceso',
      })
      .select()
      .single()

    if (errorOC || !oc) {
      console.error(errorOC)
      return NextResponse.json({ error: 'Error al crear la OC' }, { status: 500 })
    }

    const itemsOC = items.map((item: {
      codigo: string; descripcion: string; unidad: string
      cantidad: number; precio_unitario: number
    }, index: number) => ({
      registro_compras_id: oc.id,
      linea:               index + 1,
      codigo:              item.codigo || null,
      descripcion:         item.descripcion,
      unidad:              item.unidad,
      cantidad:            item.cantidad,
      precio_unitario:     item.precio_unitario || 0,
    }))

    const { error: errorItems } = await adminClient().from('items_oc').insert(itemsOC)
    if (errorItems) {
      console.error(errorItems)
      return NextResponse.json({ error: 'Error al guardar ítems' }, { status: 500 })
    }

    await registrarAuditoria({
      accion:      'crear_oc',
      entidad:     'orden_compra',
      entidad_id:  oc.id,
      referencia:  numero_oc,
      detalle:     { proveedor, area, tipo_compra, valor_total: valorTotal },
    })

    return NextResponse.json({ success: true, oc_id: oc.id, numero_oc })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
