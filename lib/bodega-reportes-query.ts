import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-035 CA-05 — mismos roles que "Stock Bajo Mínimo" (HU-033), no
// ROLES_REPORTES_COMPLETOS (que no incluye bodega/consulta).
export const ROLES_REPORTES_BODEGA = ['bodega', 'compras', 'admin', 'gerencia', 'consulta']

// Spec: HU-016 CA-10/HU-021/SC-002 — patrón de lotes de 100 para .in() a
// escala real, evita el límite de URI de PostgREST/Kong.
async function enLotes<T, R>(items: T[], fn: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const resultados: R[] = []
  for (let i = 0; i < items.length; i += 100) {
    resultados.push(...(await fn(items.slice(i, i + 100))))
  }
  return resultados
}

// Spec: HU-035 — hallazgo real de la validación de caja negra: un SELECT sin
// filtro sobre `inventario` (≥1177 filas reales) queda cortado en 1000 por
// el límite por defecto de PostgREST, sin que el cliente lo note (no hay
// error, solo menos filas) — CA-02/CA-04 escanean la tabla completa cuando
// no hay filtro de bodega/categoría, así que necesitan paginar con `.range()`
// en vez de un único `.select()`, a diferencia de los `.in()` de `enLotes()`
// (ese límite es de longitud de URI, este es de conteo de filas de salida).
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

export type FiltrosReporteBodega = {
  producto_id?: string | null
  bodega_id?: string | null
  categoria_id?: string | null
  area_id?: string | null
  tipo?: string | null
  desde?: string | null
  hasta?: string | null
  meses?: number | null
}

export function parsearFiltrosReporte(searchParams: URLSearchParams): FiltrosReporteBodega {
  const meses = searchParams.get('meses')
  return {
    producto_id: searchParams.get('producto_id'),
    bodega_id: searchParams.get('bodega_id'),
    categoria_id: searchParams.get('categoria_id'),
    area_id: searchParams.get('area_id'),
    tipo: searchParams.get('tipo'),
    desde: searchParams.get('desde'),
    hasta: searchParams.get('hasta'),
    meses: meses ? Number(meses) : null,
  }
}

// Spec: HU-035 CA-02/CA-03 — inventario nunca persiste area_id (HU-027); un
// filtro "por Área Técnica" se resuelve vía las categorías cruzadas a esa
// área (area_categoria_bodega, HU-026), mismo criterio ya usado por
// GET /api/compras/bodega/categorias?area_id=.
async function categoriaIdsPorArea(areaId: string): Promise<string[]> {
  const { data } = await adminClient()
    .from('area_categoria_bodega')
    .select('categoria_id')
    .eq('area_id', areaId)
  return (data ?? []).map((r) => r.categoria_id)
}

export type FilaMovimiento = {
  id: string
  producto_id: string
  producto_codigo: string | null
  producto_descripcion: string | null
  bodega_id: string | null
  bodega_nombre: string | null
  direccion: string
  tipo: string
  cantidad: number
  costo_unitario: number
  saldo_resultante: number
  costo_promedio_resultante: number
  fecha: string
}

// Spec: HU-035 CA-01/CA-03 — kardex valorizado (CA-01, exige producto_id) y
// movimientos por filtro (CA-03, sin exigir producto_id) comparten esta
// misma función de agregación — mismo patrón de enriquecimiento ya usado en
// GET /api/compras/bodega/kardex (HU-028), sin duplicar la lógica.
export async function obtenerMovimientosKardex(filtros: FiltrosReporteBodega): Promise<FilaMovimiento[]> {
  // Spec: restricciones técnicas de HU-035 — a escala real (≥3,104
  // movimientos históricos tras HU-036), un SELECT sin filtro de producto
  // (CA-03) puede superar el límite por defecto de PostgREST; se pagina con
  // .range() igual que obtenerExistenciasValorizadas()/obtenerSinRotacion().
  const rows = await paginarRange((desde, hasta) => {
    let query = adminClient()
      .from('kardex_movimientos')
      .select('id, producto_id, bodega_id, direccion, tipo, cantidad, costo_unitario, saldo_resultante, costo_promedio_resultante, fecha')
      .order('fecha', { ascending: false })
      .range(desde, hasta)

    if (filtros.producto_id) query = query.eq('producto_id', filtros.producto_id)
    if (filtros.bodega_id) query = query.eq('bodega_id', filtros.bodega_id)
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

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

  return rows.map((r) => ({
    ...r,
    producto_codigo: productoPorId.get(r.producto_id)?.codigo ?? null,
    producto_descripcion: productoPorId.get(r.producto_id)?.descripcion ?? null,
    bodega_nombre: r.bodega_id ? bodegaPorId.get(r.bodega_id)?.nombre ?? null : null,
  }))
}

export type FilaExistencia = {
  id: string
  codigo: string
  descripcion: string
  bodega_nombre: string | null
  categoria_nombre: string | null
  saldo_existencias: number
  costo_unitario: number
  valor_total: number
}

// Spec: HU-035 CA-02 — existencias actuales valorizadas, filtrable por
// Bodega/Categoría/Área Técnica (vía categorías cruzadas, ver categoriaIdsPorArea).
export async function obtenerExistenciasValorizadas(filtros: FiltrosReporteBodega): Promise<FilaExistencia[]> {
  let categoriaIdsFiltro: string[] | null = null
  if (filtros.area_id) {
    const categoriaIds = await categoriaIdsPorArea(filtros.area_id)
    categoriaIdsFiltro = categoriaIds.length > 0 ? categoriaIds : ['__ninguna__']
  }

  const rows = await paginarRange((desde, hasta) => {
    let query = adminClient()
      .from('inventario')
      .select('id, codigo, descripcion, bodega_id, categoria_id, saldo_existencias, costo_unitario')
      .order('codigo')
      .range(desde, hasta)

    if (filtros.bodega_id) query = query.eq('bodega_id', filtros.bodega_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (categoriaIdsFiltro) query = query.in('categoria_id', categoriaIdsFiltro)

    return query
  })

  const bodegaIds = [...new Set(rows.map((p) => p.bodega_id).filter((b): b is string => !!b))]
  const categoriaIds = [...new Set(rows.map((p) => p.categoria_id).filter((c): c is string => !!c))]

  const bodegas = await enLotes(bodegaIds, async (lote) => {
    const { data } = await adminClient().from('bodegas').select('id, nombre').in('id', lote)
    return data ?? []
  })
  const categorias = await enLotes(categoriaIds, async (lote) => {
    const { data } = await adminClient().from('categorias').select('id, nombre').in('id', lote)
    return data ?? []
  })

  const bodegaPorId = new Map(bodegas.map((b) => [b.id, b]))
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]))

  return rows.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    bodega_nombre: p.bodega_id ? bodegaPorId.get(p.bodega_id)?.nombre ?? null : null,
    categoria_nombre: p.categoria_id ? categoriaPorId.get(p.categoria_id)?.nombre ?? null : null,
    saldo_existencias: Number(p.saldo_existencias),
    costo_unitario: Number(p.costo_unitario),
    valor_total: Number(p.saldo_existencias) * Number(p.costo_unitario),
  }))
}

export type FilaSinRotacion = {
  id: string
  codigo: string
  descripcion: string
  bodega_nombre: string | null
  saldo_existencias: number
  ultimo_movimiento_fecha: string | null
}

// Spec: HU-035 CA-04 — productos sin ningún movimiento de Kardex (Entrada o
// Salida) en los últimos N meses (default 6, decisión del usuario en Fase 1).
export async function obtenerSinRotacion(filtros: FiltrosReporteBodega): Promise<FilaSinRotacion[]> {
  const meses = filtros.meses ?? 6
  const fechaCorte = new Date()
  fechaCorte.setMonth(fechaCorte.getMonth() - meses)
  const fechaCorteISO = fechaCorte.toISOString().slice(0, 10)

  const movimientosRecientes = await paginarRange((desde, hasta) =>
    adminClient().from('kardex_movimientos').select('producto_id, fecha').gte('fecha', fechaCorteISO).range(desde, hasta)
  )

  const productosConMovimientoReciente = new Set(movimientosRecientes.map((m) => m.producto_id))

  // Spec: última fecha real de movimiento (de cualquier fecha, no solo
  // dentro del rango) para mostrarla en el reporte — productos sin ningún
  // movimiento histórico muestran null.
  const ultimosMovimientos = await paginarRange((desde, hasta) =>
    adminClient().from('kardex_movimientos').select('producto_id, fecha').order('fecha', { ascending: false }).range(desde, hasta)
  )
  const ultimaFechaPorProducto = new Map<string, string>()
  for (const m of ultimosMovimientos) {
    if (!ultimaFechaPorProducto.has(m.producto_id)) ultimaFechaPorProducto.set(m.producto_id, m.fecha)
  }

  const productos = await paginarRange((desde, hasta) => {
    let query = adminClient().from('inventario').select('id, codigo, descripcion, bodega_id, saldo_existencias').order('codigo').range(desde, hasta)
    if (filtros.bodega_id) query = query.eq('bodega_id', filtros.bodega_id)
    return query
  })
  const sinRotacion = productos.filter((p) => !productosConMovimientoReciente.has(p.id))

  const bodegaIds = [...new Set(sinRotacion.map((p) => p.bodega_id).filter((b): b is string => !!b))]
  const bodegas = await enLotes(bodegaIds, async (lote) => {
    const { data } = await adminClient().from('bodegas').select('id, nombre').in('id', lote)
    return data ?? []
  })
  const bodegaPorId = new Map(bodegas.map((b) => [b.id, b]))

  return sinRotacion.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    bodega_nombre: p.bodega_id ? bodegaPorId.get(p.bodega_id)?.nombre ?? null : null,
    saldo_existencias: Number(p.saldo_existencias),
    ultimo_movimiento_fecha: ultimaFechaPorProducto.get(p.id) ?? null,
  }))
}
