import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import {
  verificarAutorizacionGuia, emitirGuia, tipoAdmiteGuia, calcularSaldoPorGuiar, sugerirMotivo,
  type InputEmitirGuia,
} from '@/lib/bodega-guia'

// Spec: HU-042 CA-04/CA-05/CA-18 — guías de un egreso y líneas con saldo por guiar.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  const { id } = await params
  const { data: egreso } = await adminClient()
    .from('documentos_egreso')
    .select('id, numero, estado, tipo, cliente_final_id, punto_entrega_id, datos_traslado')
    .eq('id', id)
    .single()
  if (!egreso) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const { data: guias } = await adminClient()
    .from('guias_remision')
    .select('id, numero, serie, estado, fecha_inicio_traslado, destinatario_nombre, created_at')
    .eq('documento_egreso_id', id)
    .order('numero', { ascending: false })

  const vigentes = (guias ?? []).filter((g) => g.estado === 'emitida').map((g) => g.id)
  const guiado = new Map<string, number>()
  if (vigentes.length > 0) {
    const { data: items } = await adminClient()
      .from('guias_remision_items').select('egreso_item_id, cantidad').in('guia_id', vigentes)
    for (const it of items ?? []) {
      guiado.set(it.egreso_item_id, (guiado.get(it.egreso_item_id) ?? 0) + Number(it.cantidad))
    }
  }

  const { data: lineas } = await adminClient()
    .from('documentos_egreso_items')
    .select('id, producto_id, cantidad, requiere_guia')
    .eq('documento_egreso_id', id)
  const productoIds = [...new Set((lineas ?? []).map((l) => l.producto_id))]
  const { data: productos } = productoIds.length > 0
    ? await adminClient().from('inventario').select('id, codigo, descripcion, unidad').in('id', productoIds)
    : { data: [] as { id: string; codigo: string; descripcion: string; unidad: string }[] }
  const prodPorId = new Map((productos ?? []).map((p) => [p.id, p]))

  const lineasGuia = (lineas ?? []).map((l) => {
    const yaGuiado = guiado.get(l.id) ?? 0
    const p = prodPorId.get(l.producto_id)
    return {
      egreso_item_id: l.id,
      producto_id: l.producto_id,
      codigo: p?.codigo ?? '',
      descripcion: p?.descripcion ?? '',
      unidad: p?.unidad ?? 'EA',
      cantidad: Number(l.cantidad),
      guiado: yaGuiado,
      saldo: calcularSaldoPorGuiar(Number(l.cantidad), yaGuiado),
      requiere_guia: l.requiere_guia,
    }
  })

  return NextResponse.json({
    elegible: egreso.estado === 'cerrado' && tipoAdmiteGuia(egreso.tipo),
    tipo_admite_guia: tipoAdmiteGuia(egreso.tipo),
    motivo_sugerido: sugerirMotivo(egreso.tipo),
    cliente_final_id: egreso.cliente_final_id,
    punto_entrega_id: egreso.punto_entrega_id,
    datos_traslado: egreso.datos_traslado,
    guias: guias ?? [],
    lineas: lineasGuia,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as InputEmitirGuia
  const r = await emitirGuia(id, body, { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol })
  if (!r.ok) return NextResponse.json({ error: r.error, excedidas: r.excedidas ?? [] }, { status: r.status })
  return NextResponse.json({ success: true, guia_id: r.guiaId, numero: r.numero }, { status: 201 })
}
