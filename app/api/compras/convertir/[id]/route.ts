import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { verificarSobrecompra, autoCompletarNP, validarEnlaceYJustificacion } from '@/lib/np-cobertura'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params
    const body = await req.json()

    const { data: np, error } = await adminClient()
      .from('notas_pedido')
      .select('*')
      .eq('id', id)
      .eq('estado', 'aprobada')
      .single()

    if (error || !np)
      return NextResponse.json({ error: 'NP no encontrada o no está en estado aprobada' }, { status: 400 })

    if (perfil.rol === 'asistente_compras' && np.asignado_a !== user.id)
      return NextResponse.json({ error: 'Solo puedes convertir NPs asignadas a ti' }, { status: 403 })

    const {
      proveedor_id, fecha_oc, descripcion_oc,
      numero_factura, fecha_factura,
      valor_total, valor_retenido,
      tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago,
      numero_cotizacion,
      items,
      sobrecompra_confirmada,
    } = body

    if (!proveedor_id)
      return NextResponse.json({ error: 'Debe seleccionar un proveedor registrado' }, { status: 400 })
    if (!items || items.length === 0)
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })

    // CA-01: toda línea de OC con NP origen debe tener item_np_id
    const sinEnlace = items
      .map((item: { item_np_id?: string }, idx: number) => ({ item, linea: idx + 1 }))
      .filter(({ item }: { item: { item_np_id?: string } }) => !item.item_np_id)
      .map(({ linea }: { linea: number }) => linea)
    if (sinEnlace.length > 0)
      return NextResponse.json({ error: 'item_sin_enlace_np', lineas: sinEnlace }, { status: 400 })

    // CA-03: justificación requerida cuando cantidad_oc ≠ cantidad_np
    const validacionEnlace = await validarEnlaceYJustificacion(items, id)
    if (!validacionEnlace.valido)
      return NextResponse.json({ error: 'justificacion_requerida', errores: validacionEnlace.errores }, { status: 400 })

    // Snapshot del proveedor
    const { data: prov } = await adminClient()
      .from('proveedores')
      .select('nombre, ruc, direccion, telefono, email, contacto')
      .eq('id', proveedor_id)
      .single()

    if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })

    // Spec CA3: verificar sobrecompra antes de insertar
    if (!sobrecompra_confirmada) {
      const excedidos = await verificarSobrecompra(np.id, items, undefined)
      if (excedidos.length > 0) {
        return NextResponse.json({
          error:           'sobrecompra',
          message:         'La cantidad ingresada supera el saldo disponible de la NP. ¿Desea continuar con esta sobrecompra?',
          items_excedidos: excedidos,
        }, { status: 409 })
      }
    }

    const year = new Date().getFullYear()
    const { data: seqData, error: seqError } = await adminClient().rpc('siguiente_numero_oc', { p_year: year })
    if (seqError || seqData === null)
      return NextResponse.json({ error: 'Error al generar número de OC' }, { status: 500 })
    const numero_oc = `OC-${year}-${String(seqData).padStart(4, '0')}`

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    const { data: oc, error: errorOC } = await adminClient()
      .from('registro_compras')
      .insert({
        nota_pedido_id:      np.id,
        proveedor_id,
        proveedor:           prov.nombre,
        proveedor_ruc:       prov.ruc       || null,
        proveedor_direccion: prov.direccion || null,
        proveedor_telefono:  prov.telefono  || null,
        proveedor_contacto:  prov.contacto  || null,
        proveedor_email:     prov.email     || null,
        numero_cotizacion:   numero_cotizacion || null,
        fecha_np:            np.created_at,
        numero_np:           np.numero,
        fecha_oc:            fecha_oc          || null,
        numero_oc,
        descripcion_oc:      descripcion_oc    || np.descripcion_general,
        area:                np.area,
        tipo_compra:         np.tipo_compra,
        centro_costo:        np.centro_costo,
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
        estado_oc:           'en_proceso',
        creado_por_id:       user.id,
        creado_por_nombre:   perfil.nombre,
        aprobador_np_nombre: np.aprobador_np_nombre ?? null,
        aprobador_np_area:   np.aprobador_np_area   ?? null,
      })
      .select()
      .single()

    if (errorOC || !oc) {
      console.error(errorOC)
      return NextResponse.json({ error: 'Error al crear la OC' }, { status: 500 })
    }

    const itemsOC = items.map((item: {
      item_np_id?: string
      codigo?: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
      tipo?: string
      informacion_adicional?: string
      fecha_entrega?: string
      justificacion_cantidad?: string
    }, index: number) => ({
      registro_compras_id:    oc.id,
      linea:                  index + 1,
      item_np_id:             item.item_np_id || null,
      codigo:                 item.codigo     || null,
      descripcion:            item.descripcion,
      unidad:                 item.unidad,
      cantidad:               item.cantidad,
      precio_unitario:        item.precio_unitario || 0,
      tipo:                   item.tipo || null,
      informacion_adicional:  item.informacion_adicional || null,
      fecha_entrega:          item.fecha_entrega || null,
      justificacion_cantidad: item.justificacion_cantidad?.trim() || null,
    }))

    const { error: errorItems } = await adminClient().from('items_oc').insert(itemsOC)
    if (errorItems) {
      console.error(errorItems)
      return NextResponse.json({ error: 'Error al guardar ítems de la OC' }, { status: 500 })
    }

    // Spec CA2: auto-completar NP si cobertura alcanza 100%
    await autoCompletarNP(np.id, np.estado).catch(console.error)

    if (!np.convertida) {
      await adminClient().from('notas_pedido').update({ convertida: true }).eq('id', np.id)
    }

    await adminClient().from('historial_np').insert({
      np_id:        np.id,
      estado:       'convertida',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        `OC generada: ${numero_oc} — Proveedor: ${prov.nombre} — ${items.length} ítem(s)`,
    })

    await registrarAuditoria({
      accion:     'convertir_np_a_oc',
      entidad:    'orden_compra',
      entidad_id: oc.id,
      referencia: numero_oc,
      detalle:    { numero_np: np.numero, proveedor: prov.nombre, items_count: items.length },
    })

    return NextResponse.json({ success: true, oc_id: oc.id, numero_oc })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
