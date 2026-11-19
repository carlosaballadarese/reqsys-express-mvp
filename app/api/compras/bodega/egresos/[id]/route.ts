import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionEgreso } from '@/lib/bodega-egreso'

// Spec: HU-030 CA-01/CA-06 — detalle con líneas.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEgreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params

  const { data: documento, error } = await adminClient()
    .from('documentos_egreso')
    .select('id, numero, bodega_id, tipo, estado, cliente_final_id, pozo_id, override_admin, justificacion_override, created_at, cerrado_en')
    .eq('id', id)
    .single()

  if (error || !documento) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const { data: lineas } = await adminClient()
    .from('documentos_egreso_items')
    .select('id, producto_id, cantidad')
    .eq('documento_egreso_id', id)

  return NextResponse.json({ ...documento, lineas: lineas ?? [] })
}

type LineaEdit = { id?: string; producto_id: string; cantidad: number }

// Spec: HU-030 CA-01/CA-06 — edita líneas mientras no esté cerrado, mismo
// patrón de reemplazo completo que HU-028.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEgreso()
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
    .from('documentos_egreso')
    .select('id, numero, estado')
    .eq('id', id)
    .single()

  if (!documento) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (!['generado', 'en_validacion'].includes(documento.estado)) {
    return NextResponse.json({ error: 'Solo se pueden editar documentos en estado Generado o En Validación' }, { status: 409 })
  }

  await adminClient().from('documentos_egreso_items').delete().eq('documento_egreso_id', id)

  if (lineas.length > 0) {
    const { error: errInsert } = await adminClient().from('documentos_egreso_items').insert(
      lineas.map((l) => ({
        documento_egreso_id: id,
        producto_id: l.producto_id,
        cantidad: Number(l.cantidad),
      }))
    )
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 })
  }

  if (documento.estado === 'generado') {
    await adminClient().from('documentos_egreso').update({ estado: 'en_validacion' }).eq('id', id)
  }

  await registrarAuditoria({
    accion: 'editar_documento_egreso',
    entidad: 'documento_egreso',
    entidad_id: id,
    referencia: documento.numero,
    detalle: { lineas: lineas.length, actor_rol: auth.rol },
  })

  return NextResponse.json({ success: true })
}
