import { adminClient } from '@/lib/supabase/clients'
import { obtenerFechasAprobacionNPBulk } from '@/lib/np-fechas-documento'

// Spec: SC-007 RN-02 — idéntico a ROLES_REPORTES_OCA (lib/oca-reportes-query.ts)
export const ROLES_REPORTE_LINEAS = ['compras', 'admin', 'asistente_compras', 'gerencia']

const LOTE = 100

function enLotes<T>(items: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += LOTE) lotes.push(items.slice(i, i + LOTE))
  return lotes
}

export type FiltrosReporteLineas = {
  fecha_desde?: string | null
  fecha_hasta?: string | null
  area?: string | null
  proveedor?: string | null
  estado_np?: string | null
}

export type FilaReporteLineas = {
  np_numero: string
  np_id: string
  area: string
  estado_np: string
  fecha_np_aprobada: string | null
  linea: number
  codigo: string | null
  descripcion: string
  cantidad: number
  proveedor_sugerido: string | null
  precio_unitario_np: number
  oc_numero: string | null
  oc_proveedor: string | null
  oc_precio_unitario: number | null
  oc_fecha_aprobada: string | null
  oca_numero: string | null
  oca_proveedor: string | null
  oca_fecha_aprobada: string | null
}

// Spec: SC-007 CA-07
export function parsearFiltrosReporteLineas(sp: URLSearchParams): FiltrosReporteLineas {
  return {
    fecha_desde: sp.get('fecha_desde'),
    fecha_hasta: sp.get('fecha_hasta'),
    area:        sp.get('area'),
    proveedor:   sp.get('proveedor')?.trim() ?? null,
    estado_np:   sp.get('estado_np'),
  }
}

type MatchOc  = { oc_numero: string; oc_proveedor: string; oc_precio_unitario: number | null; oc_fecha_aprobada: string | null }
type MatchOca = { oca_numero: string; oca_proveedor: string; oca_fecha_aprobada: string | null }

type FilaCobertura = {
  oc_numero: string | null
  oc_proveedor: string | null
  oc_precio_unitario: number | null
  oc_fecha_aprobada: string | null
  oca_numero: string | null
  oca_proveedor: string | null
  oca_fecha_aprobada: string | null
}

// Spec: SC-007 RN-01/CA-03b/CA-05 — emparejamiento por posición entre los matches
// de OC y de OCA de una misma línea. Sin ningún match de ningún lado produce 1 fila
// en blanco (CA-02); con matches en cualquiera de los 2 lados produce N = max(largo)
// filas, rellenando en blanco el lado más corto.
export function emparejarCobertura(matchesOc: MatchOc[], matchesOca: MatchOca[]): FilaCobertura[] {
  if (matchesOc.length === 0 && matchesOca.length === 0) {
    return [{
      oc_numero: null, oc_proveedor: null, oc_precio_unitario: null, oc_fecha_aprobada: null,
      oca_numero: null, oca_proveedor: null, oca_fecha_aprobada: null,
    }]
  }

  const n = Math.max(matchesOc.length, matchesOca.length)
  const filas: FilaCobertura[] = []
  for (let i = 0; i < n; i++) {
    const oc = matchesOc[i]
    const oca = matchesOca[i]
    filas.push({
      oc_numero:          oc?.oc_numero ?? null,
      oc_proveedor:       oc?.oc_proveedor ?? null,
      oc_precio_unitario: oc?.oc_precio_unitario ?? null,
      oc_fecha_aprobada:  oc?.oc_fecha_aprobada ?? null,
      oca_numero:         oca?.oca_numero ?? null,
      oca_proveedor:      oca?.oca_proveedor ?? null,
      oca_fecha_aprobada: oca?.oca_fecha_aprobada ?? null,
    })
  }
  return filas
}

// Spec: SC-007 CA-01 a CA-09 — ver documents/requirements/SC-007-.../sdd-design.md
export async function obtenerFilasReporteLineas(filtros: FiltrosReporteLineas): Promise<FilaReporteLineas[]> {
  // 1. NPs — filtros de área/estado pushed a BD (RN-06: columna de texto legado)
  let queryNP = adminClient().from('notas_pedido')
    .select('id, numero, area, estado')
    .order('numero')
  if (filtros.area) queryNP = queryNP.ilike('area', `%${filtros.area}%`)
  if (filtros.estado_np) queryNP = queryNP.eq('estado', filtros.estado_np)

  const { data: npsRaw, error: errNP } = await queryNP
  if (errNP) throw new Error(errNP.message)
  const nps = (npsRaw ?? []) as { id: string; numero: string; area: string; estado: string }[]
  if (nps.length === 0) return []

  const npIds = nps.map(np => np.id)

  // 2. fecha de aprobación de NP — bulk, evita N+1 (ver decisión de diseño #1)
  const fechasAprobacion = await obtenerFechasAprobacionNPBulk(npIds)

  // 3. filtro de rango de fecha — derivada, no expresable en la query de BD
  let npsFiltradas = nps
  if (filtros.fecha_desde || filtros.fecha_hasta) {
    npsFiltradas = nps.filter(np => {
      const fecha = fechasAprobacion.get(np.id)
      if (!fecha) return false
      if (filtros.fecha_desde && fecha < filtros.fecha_desde) return false
      if (filtros.fecha_hasta && fecha > `${filtros.fecha_hasta}T23:59:59.999Z`) return false
      return true
    })
  }
  if (npsFiltradas.length === 0) return []

  const npPorId = new Map(npsFiltradas.map(np => [np.id, np]))
  const npIdsFiltrados = npsFiltradas.map(np => np.id)

  // 4. items_np — por lotes de 100
  const itemsNp: { id: string; nota_pedido_id: string; linea: number; codigo: string | null; descripcion: string; cantidad: number; precio_unitario: number; proveedor_sugerido: string | null }[] = []
  for (const lote of enLotes(npIdsFiltrados)) {
    const { data, error } = await adminClient().from('items_np')
      .select('id, nota_pedido_id, linea, codigo, descripcion, cantidad, precio_unitario, proveedor_sugerido')
      .in('nota_pedido_id', lote)
      .order('linea')
    if (error) throw new Error(error.message)
    itemsNp.push(...(data ?? []))
  }
  if (itemsNp.length === 0) return []

  const itemIds = itemsNp.map(i => i.id)

  // 5. items_oc + registro_compras — por lotes de 100
  const matchesOcPorItem = new Map<string, MatchOc[]>()
  {
    const itemsOc: { item_np_id: string; registro_compras_id: string; precio_unitario: number }[] = []
    for (const lote of enLotes(itemIds)) {
      const { data, error } = await adminClient().from('items_oc')
        .select('item_np_id, registro_compras_id, precio_unitario')
        .in('item_np_id', lote)
      if (error) throw new Error(error.message)
      itemsOc.push(...(data ?? []))
    }

    const ocIds = [...new Set(itemsOc.map(io => io.registro_compras_id))]
    const ocs: { id: string; numero_oc: string; proveedor: string; aprobado_en: string | null }[] = []
    if (ocIds.length > 0) {
      for (const lote of enLotes(ocIds)) {
        const { data, error } = await adminClient().from('registro_compras')
          .select('id, numero_oc, proveedor, aprobado_en')
          .in('id', lote)
        if (error) throw new Error(error.message)
        ocs.push(...(data ?? []))
      }
    }

    const ocPorId = new Map(ocs.map(oc => [oc.id, oc]))
    for (const io of itemsOc) {
      const oc = ocPorId.get(io.registro_compras_id)
      if (!oc) continue
      const lista = matchesOcPorItem.get(io.item_np_id) ?? []
      lista.push({
        oc_numero: oc.numero_oc,
        oc_proveedor: oc.proveedor,
        oc_precio_unitario: Number(io.precio_unitario),
        oc_fecha_aprobada: oc.aprobado_en,
      })
      matchesOcPorItem.set(io.item_np_id, lista)
    }
  }

  // 6. oca_items + oca + proveedores — por lotes de 100
  const matchesOcaPorItem = new Map<string, MatchOca[]>()
  {
    const ocaItems: { item_np_id: string; oca_id: string }[] = []
    for (const lote of enLotes(itemIds)) {
      const { data, error } = await adminClient().from('oca_items')
        .select('item_np_id, oca_id')
        .in('item_np_id', lote)
        .not('item_np_id', 'is', null)
      if (error) throw new Error(error.message)
      ocaItems.push(...(data ?? []))
    }

    const ocaIds = [...new Set(ocaItems.map(oi => oi.oca_id))]
    const ocas: { id: string; numero_oca: string; proveedor_id: string; aprobado_en: string | null }[] = []
    if (ocaIds.length > 0) {
      for (const lote of enLotes(ocaIds)) {
        const { data, error } = await adminClient().from('oca')
          .select('id, numero_oca, proveedor_id, aprobado_en')
          .in('id', lote)
        if (error) throw new Error(error.message)
        ocas.push(...(data ?? []))
      }
    }

    const proveedorIds = [...new Set(ocas.map(o => o.proveedor_id))]
    const nombresProveedor = new Map<string, string>()
    if (proveedorIds.length > 0) {
      for (const lote of enLotes(proveedorIds)) {
        const { data } = await adminClient().from('proveedores').select('id, nombre').in('id', lote)
        for (const p of (data ?? []) as { id: string; nombre: string }[]) nombresProveedor.set(p.id, p.nombre)
      }
    }

    const ocaPorId = new Map(ocas.map(o => [o.id, o]))
    for (const oi of ocaItems) {
      if (!oi.item_np_id) continue
      const oca = ocaPorId.get(oi.oca_id)
      if (!oca) continue
      const lista = matchesOcaPorItem.get(oi.item_np_id) ?? []
      lista.push({
        oca_numero: oca.numero_oca,
        oca_proveedor: nombresProveedor.get(oca.proveedor_id) ?? '',
        oca_fecha_aprobada: oca.aprobado_en,
      })
      matchesOcaPorItem.set(oi.item_np_id, lista)
    }
  }

  // 7. componer filas
  let filas: FilaReporteLineas[] = []
  for (const item of itemsNp) {
    const np = npPorId.get(item.nota_pedido_id)
    if (!np) continue

    const coberturas = emparejarCobertura(
      matchesOcPorItem.get(item.id) ?? [],
      matchesOcaPorItem.get(item.id) ?? []
    )

    for (const cob of coberturas) {
      filas.push({
        np_numero: np.numero,
        np_id: np.id,
        area: np.area,
        estado_np: np.estado,
        fecha_np_aprobada: fechasAprobacion.get(np.id) ?? null,
        linea: item.linea,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad),
        proveedor_sugerido: item.proveedor_sugerido,
        precio_unitario_np: Number(item.precio_unitario),
        ...cob,
      })
    }
  }

  // 8. post-filtro de proveedor — ilike contra las 3 columnas de proveedor (JS, decisión #4)
  if (filtros.proveedor) {
    const buscado = filtros.proveedor.toLowerCase()
    filas = filas.filter(f =>
      (f.proveedor_sugerido ?? '').toLowerCase().includes(buscado) ||
      (f.oc_proveedor ?? '').toLowerCase().includes(buscado) ||
      (f.oca_proveedor ?? '').toLowerCase().includes(buscado)
    )
  }

  return filas
}
