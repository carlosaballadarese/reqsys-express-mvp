import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { registrarAuditoria } from '@/lib/auditoria'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    // Generar número de OC secuencial
    const year = new Date().getFullYear()
    const { data: seqData, error: seqError } = await supabaseAdmin.rpc('siguiente_numero_oc', { p_year: year })
    if (seqError || seqData === null) {
      return NextResponse.json({ error: 'Error al generar número de OC' }, { status: 500 })
    }
    const numero_oc = `OC-${year}-${String(seqData).padStart(4, '0')}`

    const {
      proveedor,
      fecha_oc,
      descripcion_oc,
      numero_factura,
      fecha_factura,
      valor_total,
      valor_retenido,
      tipo_pago,
      banco,
      dias_credito,
      fecha_vencimiento,
      mes_pago,
      items,
      proveedor_id,
    } = body

    // Verificar que la NP existe, está aprobada y no fue ya convertida
    const { data: np, error } = await supabase
      .from('notas_pedido')
      .select('*')
      .eq('id', id)
      .eq('estado', 'aprobada')
      .eq('convertida', false)
      .single()

    if (error || !np) {
      return NextResponse.json(
        { error: 'NP no encontrada, no está aprobada, o ya fue convertida' },
        { status: 400 }
      )
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })
    }

    // Calcular totales desde los ítems de la OC
    const valorTotal    = Number(valor_total) || 0
    const valorRetenido = Number(valor_retenido) || 0

    // Insertar en registro_compras
    const { data: oc, error: errorOC } = await supabaseAdmin
      .from('registro_compras')
      .insert({
        nota_pedido_id:        np.id,
        proveedor_id:          proveedor_id || null,
        fecha_np:              np.created_at,
        numero_np:             np.numero,
        proveedor,
        fecha_oc:              fecha_oc || null,
        numero_oc,
        descripcion_oc:        descripcion_oc || np.descripcion_general,
        area:                  np.area,
        tipo_compra:           np.tipo_compra,
        centro_costo:          np.centro_costo,
        numero_factura:        numero_factura || null,
        fecha_factura:         fecha_factura || null,
        valor_total:           valorTotal,
        valor_retenido:        valorRetenido,
        valor_a_pagar:         valorTotal - valorRetenido,
        banco:                 banco || null,
        tipo_pago:             tipo_pago || null,
        mes_pago:              mes_pago || null,
        dias_credito:          Number(dias_credito) || 0,
        fecha_vencimiento:     fecha_vencimiento || null,
        estado_oc:             'en_proceso',
      })
      .select()
      .single()

    if (errorOC || !oc) {
      console.error(errorOC)
      return NextResponse.json({ error: 'Error al crear la OC' }, { status: 500 })
    }

    // Insertar ítems de la OC
    const itemsOC = items.map((item: {
      codigo: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
    }, index: number) => ({
      registro_compras_id: oc.id,
      linea:               index + 1,
      codigo:              item.codigo || null,
      descripcion:         item.descripcion,
      unidad:              item.unidad,
      cantidad:            item.cantidad,
      precio_unitario:     item.precio_unitario || 0,
    }))

    const { error: errorItems } = await supabaseAdmin.from('items_oc').insert(itemsOC)
    if (errorItems) {
      console.error(errorItems)
      return NextResponse.json({ error: 'Error al guardar ítems de la OC' }, { status: 500 })
    }

    // Marcar NP como convertida
    await supabaseAdmin
      .from('notas_pedido')
      .update({ convertida: true })
      .eq('id', np.id)

    // Registrar en historial
    await supabaseAdmin.from('historial_np').insert({
      np_id:        np.id,
      estado:       'convertida',
      actor_email:  null,
      actor_nombre: 'Compras',
      notas:        `Convertida a OC ${numero_oc} — Proveedor: ${proveedor}`,
    })

    await registrarAuditoria({
      accion:     'convertir_np_a_oc',
      entidad:    'orden_compra',
      entidad_id: oc.id,
      referencia: numero_oc,
      detalle:    { numero_np: np.numero, proveedor },
    })

    return NextResponse.json({ success: true, oc_id: oc.id, numero_oc })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
