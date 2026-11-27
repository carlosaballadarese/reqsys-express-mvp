import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionIngreso } from '@/lib/bodega-ingreso'

// Spec: HU-028 CA-03 — detalle con líneas, incluyendo la OC de origen.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params

  const { data: documento, error } = await adminClient()
    .from('documentos_ingreso')
    .select('id, numero, bodega_id, estado, tipo_movimiento, registro_compras_id, created_at, cerrado_en, motivo_anulacion')
    .eq('id', id)
    .single()

  if (error || !documento) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const { data: lineas } = await adminClient()
    .from('documentos_ingreso_items')
    .select('id, item_oc_id, producto_id, codigo_oc, descripcion_oc, cantidad, costo_unitario, justificacion, es_importacion, costo_fob, factor_nacionalizacion')
    .eq('documento_ingreso_id', id)

  // Enriquecer con código/descripción del producto ya vinculado — evita que
  // la pantalla de detalle cargue el catálogo completo de inventario solo
  // para mostrar el nombre de las líneas ya resueltas.
  const productoIds = [...new Set((lineas ?? []).map((l) => l.producto_id).filter(Boolean))]
  let productosPorId = new Map<string, { codigo: string; descripcion: string }>()
  if (productoIds.length > 0) {
    const { data: productos } = await adminClient()
      .from('inventario')
      .select('id, codigo, descripcion')
      .in('id', productoIds)
    productosPorId = new Map((productos ?? []).map((p) => [p.id, { codigo: p.codigo, descripcion: p.descripcion }]))
  }
  const lineasConProducto = (lineas ?? []).map((l) => ({
    ...l,
    producto_codigo: l.producto_id ? (productosPorId.get(l.producto_id)?.codigo ?? null) : null,
    producto_descripcion: l.producto_id ? (productosPorId.get(l.producto_id)?.descripcion ?? null) : null,
  }))

  let numeroOc: string | null = null
  if (documento.registro_compras_id) {
    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('numero_oc')
      .eq('id', documento.registro_compras_id)
      .single()
    numeroOc = oc?.numero_oc ?? null
  }

  let bodegaNombre: string | null = null
  if (documento.bodega_id) {
    const { data: bodega } = await adminClient()
      .from('bodegas')
      .select('nombre')
      .eq('id', documento.bodega_id)
      .single()
    bodegaNombre = bodega?.nombre ?? null
  }

  return NextResponse.json({ ...documento, numero_oc: numeroOc, bodega_nombre: bodegaNombre, lineas: lineasConProducto })
}

type LineaEdit = {
  id?: string
  // Spec: HU-047 CA-01 — preservado tal cual al reemplazar las líneas
  // (round-trip GET→PUT); el PUT nunca lo calcula ni lo valida, solo lo guarda.
  item_oc_id?: string | null
  producto_id: string | null
  codigo_oc?: string | null
  descripcion_oc: string
  cantidad: number
  costo_unitario: number
  justificacion?: string | null
  // Spec: HU-032 CA-01 — costeo landed de importaciones.
  es_importacion?: boolean
  costo_fob?: number | null
  factor_nacionalizacion?: number | null
}

// Spec: HU-028 CA-03 — edita/agrega/elimina líneas mientras no esté cerrado
// (reemplazo completo de líneas, mismo patrón ya usado en items_oc/oca_items
// del resto del proyecto para relaciones editables de 1 documento a muchas
// líneas). La primera edición real mueve el estado a 'en_validación'
// (decisión de diseño — ver sdd-design.md, es solo informativo para la UI).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params
  const body = await req.json()
  const lineas: LineaEdit[] = Array.isArray(body.lineas) ? body.lineas : []

  const { data: documento } = await adminClient()
    .from('documentos_ingreso')
    .select('id, numero, estado')
    .eq('id', id)
    .single()

  if (!documento) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (!['generado', 'en_validacion'].includes(documento.estado)) {
    return NextResponse.json({ error: 'Solo se pueden editar documentos en estado Generado o En Validación' }, { status: 409 })
  }

  await adminClient().from('documentos_ingreso_items').delete().eq('documento_ingreso_id', id)

  // Spec: hallazgo real de usuario (2026-11-26) — la bodega también se
  // puede corregir/asignar aquí, no solo al crear el documento (cubre tanto
  // los ya existentes con bodega_id=null como una corrección posterior).
  if (typeof body.bodega_id !== 'undefined') {
    await adminClient()
      .from('documentos_ingreso')
      .update({ bodega_id: body.bodega_id || null })
      .eq('id', id)
  }

  if (lineas.length > 0) {
    const { error: errInsert } = await adminClient().from('documentos_ingreso_items').insert(
      lineas.map((l) => ({
        documento_ingreso_id: id,
        item_oc_id: l.item_oc_id ?? null,
        producto_id: l.producto_id || null,
        codigo_oc: l.codigo_oc ?? null,
        descripcion_oc: l.descripcion_oc,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
        justificacion: l.justificacion ?? null,
        es_importacion: !!l.es_importacion,
        costo_fob: l.costo_fob ?? null,
        factor_nacionalizacion: l.factor_nacionalizacion ?? null,
      }))
    )
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 })
  }

  if (documento.estado === 'generado') {
    await adminClient().from('documentos_ingreso').update({ estado: 'en_validacion' }).eq('id', id)
  }

  await registrarAuditoria({
    accion: 'editar_documento_ingreso',
    entidad: 'documento_ingreso',
    entidad_id: id,
    referencia: documento.numero,
    detalle: { lineas: lineas.length, actor_rol: auth.rol },
  })

  return NextResponse.json({ success: true })
}
