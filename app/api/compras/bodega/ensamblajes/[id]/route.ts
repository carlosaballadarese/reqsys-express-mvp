import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionEnsamblaje } from '@/lib/bodega-ensamblaje'

// Spec: HU-031 CA-01 — detalle con insumos y resultados.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEnsamblaje()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params

  const { data: orden, error } = await adminClient()
    .from('ordenes_ensamblaje')
    .select('id, numero, bodega_id, estado, created_at, confirmado_en')
    .eq('id', id)
    .single()

  if (error || !orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  const { data: insumos } = await adminClient()
    .from('ordenes_ensamblaje_insumos')
    .select('id, producto_id, cantidad')
    .eq('orden_ensamblaje_id', id)
  const { data: resultados } = await adminClient()
    .from('ordenes_ensamblaje_resultados')
    .select('id, producto_id, cantidad')
    .eq('orden_ensamblaje_id', id)

  // Enriquecer con código/descripción del producto — evita que la pantalla
  // de detalle cargue el catálogo completo de inventario solo para mostrar
  // estas pocas líneas (mismo criterio ya aplicado en Ingresos/Egresos).
  const productoIds = [...new Set([...(insumos ?? []), ...(resultados ?? [])].map((l) => l.producto_id).filter(Boolean))]
  let productosPorId = new Map<string, { codigo: string; descripcion: string }>()
  if (productoIds.length > 0) {
    const { data: productos } = await adminClient()
      .from('inventario')
      .select('id, codigo, descripcion')
      .in('id', productoIds)
    productosPorId = new Map((productos ?? []).map((p) => [p.id, { codigo: p.codigo, descripcion: p.descripcion }]))
  }
  const conProducto = (lineas: { id: string; producto_id: string; cantidad: number }[]) =>
    lineas.map((l) => ({
      ...l,
      codigo: productosPorId.get(l.producto_id)?.codigo ?? null,
      descripcion: productosPorId.get(l.producto_id)?.descripcion ?? null,
    }))

  return NextResponse.json({ ...orden, insumos: conProducto(insumos ?? []), resultados: conProducto(resultados ?? []) })
}

type Linea = { id?: string; producto_id: string; cantidad: number }

// Spec: HU-031 CA-01/CA-06 — edita mientras no está confirmada (sin estado
// 'en_validacion' intermedio, a diferencia de Ingreso/Egreso).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEnsamblaje()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params
  const body = await req.json()
  const insumos: Linea[] = Array.isArray(body.insumos) ? body.insumos : []
  const resultados: Linea[] = Array.isArray(body.resultados) ? body.resultados : []

  const { data: orden } = await adminClient()
    .from('ordenes_ensamblaje')
    .select('id, numero, estado')
    .eq('id', id)
    .single()

  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  if (orden.estado === 'confirmada') {
    return NextResponse.json({ error: 'No se puede editar una orden ya confirmada' }, { status: 409 })
  }

  await adminClient().from('ordenes_ensamblaje_insumos').delete().eq('orden_ensamblaje_id', id)
  await adminClient().from('ordenes_ensamblaje_resultados').delete().eq('orden_ensamblaje_id', id)

  if (insumos.length > 0) {
    await adminClient().from('ordenes_ensamblaje_insumos').insert(
      insumos.map((l) => ({ orden_ensamblaje_id: id, producto_id: l.producto_id, cantidad: Number(l.cantidad) }))
    )
  }
  if (resultados.length > 0) {
    await adminClient().from('ordenes_ensamblaje_resultados').insert(
      resultados.map((l) => ({ orden_ensamblaje_id: id, producto_id: l.producto_id, cantidad: Number(l.cantidad) }))
    )
  }

  await registrarAuditoria({
    accion: 'editar_orden_ensamblaje',
    entidad: 'orden_ensamblaje',
    entidad_id: id,
    referencia: orden.numero,
    detalle: { insumos: insumos.length, resultados: resultados.length, actor_rol: auth.rol },
  })

  return NextResponse.json({ success: true })
}
