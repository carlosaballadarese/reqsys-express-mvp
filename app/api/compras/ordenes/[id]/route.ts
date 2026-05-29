import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: oc, error } = await adminClient()
    .from('registro_compras')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

  const { data: items } = await adminClient()
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
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: ocEstado } = await adminClient()
      .from('registro_compras').select('estado_oc, creado_por_id').eq('id', id).single()
    if (ocEstado && ocEstado.estado_oc !== 'en_proceso')
      return NextResponse.json({ error: 'Solo se pueden editar OCs en estado En Proceso' }, { status: 409 })

    if (perfil.rol === 'asistente_compras') {
      if (!ocEstado || ocEstado.creado_por_id !== user.id)
        return NextResponse.json({ error: 'Solo puedes editar OCs que tú generaste' }, { status: 403 })
    }

    const body = await req.json()

    const {
      proveedor_id, fecha_oc, descripcion_oc,
      area, tipo_compra, centro_costo,
      numero_factura, fecha_factura,
      valor_total, valor_retenido,
      tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago,
      numero_cotizacion, condiciones_minimas,
      items,
    } = body

    if (!proveedor_id) {
      return NextResponse.json({ error: 'Debe seleccionar un proveedor registrado' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })
    }

    // Actualizar snapshot del proveedor al editar
    const { data: prov } = await adminClient()
      .from('proveedores')
      .select('nombre, ruc, direccion, telefono, email, contacto')
      .eq('id', proveedor_id)
      .single()

    if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    const { error: errorOC } = await adminClient()
      .from('registro_compras')
      .update({
        proveedor_id,
        proveedor:           prov.nombre,
        proveedor_ruc:       prov.ruc       || null,
        proveedor_direccion: prov.direccion || null,
        proveedor_telefono:  prov.telefono  || null,
        proveedor_contacto:  prov.contacto  || null,
        proveedor_email:     prov.email     || null,
        numero_cotizacion:   numero_cotizacion   || null,
        condiciones_minimas: condiciones_minimas || null,
        fecha_oc:            fecha_oc            || null,
        descripcion_oc:      descripcion_oc    || null,
        area:                area              || null,
        tipo_compra:         tipo_compra       || null,
        centro_costo:        centro_costo      || null,
        numero_factura:      numero_factura    || null,
        fecha_factura:       fecha_factura     || null,
        valor_total:         valorTotal,
        valor_retenido:      valorRetenido,
        valor_a_pagar:       valorTotal - valorRetenido,
        banco:               banco             || null,
        tipo_pago:           tipo_pago         || null,
        mes_pago:            mes_pago          || null,
        dias_credito:        Number(dias_credito) || 0,
        fecha_vencimiento:   fecha_vencimiento || null,
      })
      .eq('id', id)

    if (errorOC) return NextResponse.json({ error: errorOC.message }, { status: 500 })

    await adminClient().from('items_oc').delete().eq('registro_compras_id', id)

    const itemsOC = items.map((item: {
      codigo: string; descripcion: string; unidad: string
      cantidad: number; precio_unitario: number
      tipo?: string; informacion_adicional?: string; fecha_entrega?: string
    }, index: number) => ({
      registro_compras_id:  id,
      linea:                index + 1,
      codigo:               item.codigo || null,
      descripcion:          item.descripcion,
      unidad:               item.unidad,
      cantidad:             item.cantidad,
      precio_unitario:      item.precio_unitario || 0,
      tipo:                 item.tipo || null,
      informacion_adicional: item.informacion_adicional || null,
      fecha_entrega:        item.fecha_entrega || null,
    }))

    const { error: errorItems } = await adminClient().from('items_oc').insert(itemsOC)
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 })

    const { data: ocActual } = await adminClient()
      .from('registro_compras')
      .select('numero_oc')
      .eq('id', id)
      .single()

    await registrarAuditoria({
      accion:     'editar_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: ocActual?.numero_oc ?? id,
      detalle:    { proveedor: prov.nombre, area, tipo_compra, valor_total: valorTotal },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
