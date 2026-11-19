import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionIngreso } from '@/lib/bodega-ingreso'

// Spec: HU-016 CA-10/HU-021/SC-002 — patrón de lotes de 100 para .in() a
// escala real, evita el límite de URI de PostgREST/Kong.
async function enLotes<T, R>(items: T[], fn: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const resultados: R[] = []
  for (let i = 0; i < items.length; i += 100) {
    resultados.push(...(await fn(items.slice(i, i + 100))))
  }
  return resultados
}

// Spec: HU-028 CA-08 — vista "Kardex por producto": listado cronológico con
// saldo/costo corriendo, filtrable por producto/bodega/rango de fechas/tipo.
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const url = new URL(req.url)
  const productoId = url.searchParams.get('producto_id')
  const bodegaId = url.searchParams.get('bodega_id')
  const tipo = url.searchParams.get('tipo')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')

  let query = adminClient()
    .from('kardex_movimientos')
    .select('id, producto_id, bodega_id, direccion, tipo, cantidad, costo_unitario, saldo_resultante, costo_promedio_resultante, documento_ingreso_id, fecha')
    .order('fecha', { ascending: false })

  if (productoId) query = query.eq('producto_id', productoId)
  if (bodegaId) query = query.eq('bodega_id', bodegaId)
  if (tipo) query = query.eq('tipo', tipo)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data: movimientos, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = movimientos ?? []
  const productoIds = [...new Set(rows.map((r) => r.producto_id))]
  const bodegaIds = [...new Set(rows.map((r) => r.bodega_id).filter((b): b is string => !!b))]

  const productos = await enLotes(productoIds, async (lote) => {
    const { data } = await adminClient().from('inventario').select('id, codigo, descripcion').in('id', lote)
    return data ?? []
  })
  const bodegas = await enLotes(bodegaIds, async (lote) => {
    const { data } = await adminClient().from('bodegas').select('id, nombre').in('id', lote)
    return data ?? []
  })

  const productoPorId = new Map(productos.map((p) => [p.id, p]))
  const bodegaPorId = new Map(bodegas.map((b) => [b.id, b]))

  const enriquecidos = rows.map((r) => ({
    ...r,
    producto_codigo: productoPorId.get(r.producto_id)?.codigo ?? null,
    producto_descripcion: productoPorId.get(r.producto_id)?.descripcion ?? null,
    bodega_nombre: r.bodega_id ? bodegaPorId.get(r.bodega_id)?.nombre ?? null : null,
  }))

  return NextResponse.json(enriquecidos)
}
