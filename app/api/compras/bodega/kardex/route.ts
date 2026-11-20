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

// Correccion post-cierre HU-036 (mismo patron que DEF-HU-035-001 /
// lib/bodega-reportes-query.ts::paginarRange): un SELECT sin .range() se
// corta en silencio a 1000 filas por defecto de PostgREST. La tabla ya
// supera ese umbral (3105 movimientos historicos reales) — sin esto, una
// busqueda sin producto_id (incluida la carga inicial de la pagina) perdia
// cualquier movimiento mas nuevo que el corte, sin ningun error visible.
async function paginarRange<T>(
  construirQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const TAMANIO_PAGINA = 1000
  const resultados: T[] = []
  let desde = 0
  for (;;) {
    const { data } = await construirQuery(desde, desde + TAMANIO_PAGINA - 1)
    const pagina = data ?? []
    resultados.push(...pagina)
    if (pagina.length < TAMANIO_PAGINA) break
    desde += TAMANIO_PAGINA
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

  // Correccion post-cierre HU-036: orden ascendente real (un Kardex se lee
  // de mas viejo a mas nuevo para seguir la evolucion del saldo) + desempate
  // explicito para movimientos historicos con la misma fecha
  // (secuencia_historica, NULL en movimientos en vivo) + created_at como
  // ultimo desempate para movimientos en vivo (cada documento cierra en un
  // instante real distinto).
  const rows = await paginarRange((desdeRange, hastaRange) => {
    let query = adminClient()
      .from('kardex_movimientos')
      .select('id, producto_id, bodega_id, direccion, tipo, cantidad, costo_unitario, saldo_resultante, costo_promedio_resultante, documento_ingreso_id, fecha')
      .order('fecha', { ascending: true })
      .order('secuencia_historica', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .range(desdeRange, hastaRange)

    if (productoId) query = query.eq('producto_id', productoId)
    if (bodegaId) query = query.eq('bodega_id', bodegaId)
    if (tipo) query = query.eq('tipo', tipo)
    if (desde) query = query.gte('fecha', desde)
    if (hasta) query = query.lte('fecha', hasta)

    return query
  })
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
