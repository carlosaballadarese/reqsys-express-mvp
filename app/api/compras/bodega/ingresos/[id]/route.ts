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
    .select('id, numero, bodega_id, estado, registro_compras_id, created_at, cerrado_en, motivo_anulacion')
    .eq('id', id)
    .single()

  if (error || !documento) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const { data: lineas } = await adminClient()
    .from('documentos_ingreso_items')
    .select('id, producto_id, codigo_oc, descripcion_oc, cantidad, costo_unitario, justificacion')
    .eq('documento_ingreso_id', id)

  let numeroOc: string | null = null
  if (documento.registro_compras_id) {
    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('numero_oc')
      .eq('id', documento.registro_compras_id)
      .single()
    numeroOc = oc?.numero_oc ?? null
  }

  return NextResponse.json({ ...documento, numero_oc: numeroOc, lineas: lineas ?? [] })
}

type LineaEdit = {
  id?: string
  producto_id: string | null
  codigo_oc?: string | null
  descripcion_oc: string
  cantidad: number
  costo_unitario: number
  justificacion?: string | null
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

  if (lineas.length > 0) {
    const { error: errInsert } = await adminClient().from('documentos_ingreso_items').insert(
      lineas.map((l) => ({
        documento_ingreso_id: id,
        producto_id: l.producto_id || null,
        codigo_oc: l.codigo_oc ?? null,
        descripcion_oc: l.descripcion_oc,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
        justificacion: l.justificacion ?? null,
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
