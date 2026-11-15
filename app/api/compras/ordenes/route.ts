import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { calcularAlertaAntiguedadOC } from '@/lib/oc-alertas'

// Spec: SC-017 — mismo patrón de chunking ya usado en lib/oc-np-origen.ts /
// lib/reporte-lineas-np-query.ts (duplicado deliberadamente, no compartido).
const LOTE = 100
function enLotes<T>(items: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += LOTE) lotes.push(items.slice(i, i + LOTE))
  return lotes
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const estado    = searchParams.get('estado')
  const q         = searchParams.get('q')?.trim()
  const area      = searchParams.get('area')
  // Spec: SC-016 — filtro estructurado por proveedor para la Vista "En
  // proceso" (match exacto sobre el campo ya denormalizado), distinto del
  // `q` de texto libre ya existente.
  const proveedor = searchParams.get('proveedor')

  let query = adminClient()
    .from('registro_compras')
    .select('id, numero_oc, numero_np, proveedor, area, tipo_compra, valor_total, valor_a_pagar, estado_oc, fecha_oc, created_at')
    .order('created_at', { ascending: false })

  if (estado    && estado    !== 'todos')  query = query.eq('estado_oc', estado)
  if (area      && area      !== 'todas')  query = query.eq('area', area)
  if (proveedor && proveedor !== 'todos')  query = query.eq('proveedor', proveedor)
  if (q) query = query.or(`numero_oc.ilike.%${q}%,numero_np.ilike.%${q}%,proveedor.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Spec: SC-016 RN-07 — alerta de 30+ días calendario para OCs en_proceso.
  const conAlerta = (data ?? []).map(oc => ({
    ...oc,
    alerta_antiguedad: calcularAlertaAntiguedadOC(oc.created_at, oc.estado_oc),
  }))

  // Spec: SC-017 CA — items_count por OC, acotado a estado=en_proceso (la
  // lista que consume el selector "Agregar a OC existente") para no pagar
  // este costo adicional en las demás Vistas de SC-011 que ya usan este GET.
  if (estado === 'en_proceso' && conAlerta.length > 0) {
    const ids = conAlerta.map(oc => oc.id)
    const conteos = new Map<string, number>()
    for (const lote of enLotes(ids)) {
      const { data: itemsLote } = await adminClient()
        .from('items_oc')
        .select('registro_compras_id')
        .in('registro_compras_id', lote)
      for (const it of (itemsLote ?? []) as { registro_compras_id: string }[]) {
        conteos.set(it.registro_compras_id, (conteos.get(it.registro_compras_id) ?? 0) + 1)
      }
    }
    const conConteo = conAlerta.map(oc => ({ ...oc, items_count: conteos.get(oc.id) ?? 0 }))
    return NextResponse.json(conConteo)
  }

  return NextResponse.json(conAlerta)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol, nombre')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const body = await req.json()

    // Spec: SC-016 — numeración diferida a la emisión (RN-01). La OC se crea
    // sin número ("— sin asignar —" en pantalla); `siguiente_numero_oc` se
    // consume solo en POST .../enviar-aprobacion ("Emitir OC").
    const numero_oc: string | null = null

    const {
      proveedor_id, proveedor, fecha_oc, descripcion_oc,
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

    // Snapshot de datos del proveedor al momento de crear la OC
    const { data: prov } = await adminClient()
      .from('proveedores')
      .select('nombre, ruc, direccion, telefono, email, contacto')
      .eq('id', proveedor_id)
      .single()

    if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    const { data: oc, error: errorOC } = await adminClient()
      .from('registro_compras')
      .insert({
        proveedor_id,
        proveedor:           prov.nombre,
        proveedor_ruc:       prov.ruc        || null,
        proveedor_direccion: prov.direccion  || null,
        proveedor_telefono:  prov.telefono   || null,
        proveedor_contacto:  prov.contacto   || null,
        proveedor_email:     prov.email      || null,
        numero_cotizacion:   numero_cotizacion   || null,
        condiciones_minimas: condiciones_minimas || null,
        numero_oc,
        fecha_oc:            fecha_oc          || null,
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
        estado_oc:           'en_proceso',
        creado_por_id:       user.id,
        creado_por_nombre:   perfil.nombre,
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
      tipo?: string; informacion_adicional?: string; fecha_entrega?: string
    }, index: number) => ({
      registro_compras_id:  oc.id,
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
    if (errorItems) {
      console.error(errorItems)
      return NextResponse.json({ error: 'Error al guardar ítems' }, { status: 500 })
    }

    await registrarAuditoria({
      accion:      'crear_oc',
      entidad:     'orden_compra',
      entidad_id:  oc.id,
      referencia:  numero_oc ?? undefined,
      detalle:     { proveedor: prov.nombre, area, tipo_compra, valor_total: valorTotal },
    })

    return NextResponse.json({ success: true, oc_id: oc.id, numero_oc })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
