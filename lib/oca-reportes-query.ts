import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-023 RN-03 — mismo criterio que dashboard-ocs (HU-004/HU-005):
// reportes administrativo-financieros, excluye solicitante/bodega/consulta/coordinador.
export const ROLES_REPORTES_OCA = ['compras', 'admin', 'asistente_compras', 'gerencia']

export type FiltrosReporteOca = {
  oca_id?: string | null
  proveedor_id?: string | null
  tipo?: string | null
  estado?: string | null
  area_id?: string | null
  usuario_id?: string | null
  enmienda_tipo?: string | null
  desde?: string | null
  hasta?: string | null
}

export function parsearFiltrosReporte(searchParams: URLSearchParams): FiltrosReporteOca {
  return {
    oca_id: searchParams.get('oca_id'),
    proveedor_id: searchParams.get('proveedor_id'),
    tipo: searchParams.get('tipo'),
    estado: searchParams.get('estado'),
    area_id: searchParams.get('area_id'),
    usuario_id: searchParams.get('usuario_id'),
    enmienda_tipo: searchParams.get('enmienda_tipo'),
    desde: searchParams.get('desde'),
    hasta: searchParams.get('hasta'),
  }
}

type NombrePorId = Record<string, string>

async function mapaNombres(tabla: string, columnaNombre: string, ids: string[]): Promise<NombrePorId> {
  if (ids.length === 0) return {}
  const { data } = await adminClient().from(tabla).select(`id, ${columnaNombre}`).in('id', ids)
  const mapa: NombrePorId = {}
  for (const fila of (data ?? []) as Record<string, string>[]) mapa[fila.id] = fila[columnaNombre]
  return mapa
}

// Spec: HU-023 CA-01 — mismas columnas que GET /api/compras/ocas (HU-018/021),
// reutilizando el mismo cálculo bulk de consumido (HU-021 CA-10).
export type FilaEstadoOca = {
  id: string; numero_oca: string; proveedor_nombre: string; tipo: string
  fecha_inicio: string; fecha_fin: string
  presupuesto_total: number; consumido: number; disponible: number
  porcentaje_ejecucion: number; estado: string
}

export async function obtenerEstadoOcas(filtros: FiltrosReporteOca): Promise<FilaEstadoOca[]> {
  let query = adminClient().from('oca').select('*').order('numero_oca')
  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.proveedor_id) query = query.eq('proveedor_id', filtros.proveedor_id)
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.desde) query = query.gte('fecha_inicio', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha_fin', filtros.hasta)

  const { data: ocas } = await query
  const filas = ocas ?? []
  const ocaIds = filas.map((o: { id: string }) => o.id)

  const [nombresProveedor, releasesAprobados] = await Promise.all([
    mapaNombres('proveedores', 'nombre', [...new Set(filas.map((o: { proveedor_id: string }) => o.proveedor_id))]),
    ocaIds.length > 0
      ? adminClient().from('oca_releases').select('oca_id, monto_total').in('oca_id', ocaIds).eq('estado', 'aprobado')
      : Promise.resolve({ data: [] as { oca_id: string; monto_total: number }[] }),
  ])

  const consumidoPorOca: Record<string, number> = {}
  for (const r of releasesAprobados.data ?? []) {
    consumidoPorOca[r.oca_id] = (consumidoPorOca[r.oca_id] ?? 0) + Number(r.monto_total)
  }

  return filas.map((o: {
    id: string; numero_oca: string; proveedor_id: string; tipo: string
    fecha_inicio: string; fecha_fin: string; presupuesto_total: number; estado: string
  }) => {
    const consumido = consumidoPorOca[o.id] ?? 0
    const presupuestoTotal = Number(o.presupuesto_total)
    return {
      id: o.id,
      numero_oca: o.numero_oca,
      proveedor_nombre: nombresProveedor[o.proveedor_id] ?? '',
      tipo: o.tipo,
      fecha_inicio: o.fecha_inicio,
      fecha_fin: o.fecha_fin,
      presupuesto_total: presupuestoTotal,
      consumido,
      disponible: presupuestoTotal - consumido,
      porcentaje_ejecucion: presupuestoTotal > 0 ? Math.round((consumido / presupuestoTotal) * 100) : 0,
      estado: o.estado,
    }
  })
}

// Spec: HU-023 CA-02 — igual forma que GET .../releases/pendientes (HU-021),
// sin restringir a pendiente_aprobacion ni aplicar scope por coordinador
// (los roles de ROLES_REPORTES_OCA ya ven todo, Decisión de diseño #3).
export type FilaDetalleRelease = {
  id: string; numero_release: string; numero_oca: string; proveedor_nombre: string
  area_nombre: string; solicitante_nombre: string; monto_total: number
  estado: string; facturado: boolean; numero_factura: string | null; created_at: string
}

export async function obtenerDetalleReleases(filtros: FiltrosReporteOca): Promise<FilaDetalleRelease[]> {
  let query = adminClient().from('oca_releases').select('*').order('created_at', { ascending: false })
  if (filtros.oca_id) query = query.eq('oca_id', filtros.oca_id)
  if (filtros.area_id) query = query.eq('area_id', filtros.area_id)
  if (filtros.usuario_id) query = query.eq('solicitante_id', filtros.usuario_id)
  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.desde) query = query.gte('created_at', filtros.desde)
  if (filtros.hasta) query = query.lte('created_at', filtros.hasta)

  const { data: releases } = await query
  let filas = releases ?? []

  const ocaIds = [...new Set(filas.map((r: { oca_id: string }) => r.oca_id))]
  const { data: ocas } = ocaIds.length > 0
    ? await adminClient().from('oca').select('id, numero_oca, proveedor_id').in('id', ocaIds)
    : { data: [] as { id: string; numero_oca: string; proveedor_id: string }[] }

  if (filtros.proveedor_id) {
    const ocaIdsDelProveedor = new Set((ocas ?? []).filter(o => o.proveedor_id === filtros.proveedor_id).map(o => o.id))
    filas = filas.filter((r: { oca_id: string }) => ocaIdsDelProveedor.has(r.oca_id))
  }

  const numeroOcaPorId: Record<string, string> = {}
  const proveedorIdPorOca: Record<string, string> = {}
  for (const o of ocas ?? []) { numeroOcaPorId[o.id] = o.numero_oca; proveedorIdPorOca[o.id] = o.proveedor_id }

  const areaIds = [...new Set(filas.map((r: { area_id: string }) => r.area_id))]
  const solicitanteIds = [...new Set(filas.map((r: { solicitante_id: string }) => r.solicitante_id))]
  const proveedorIds = [...new Set(Object.values(proveedorIdPorOca))]

  const [nombresArea, nombresSolicitante, nombresProveedor] = await Promise.all([
    mapaNombres('areas', 'nombre', areaIds),
    mapaNombres('perfiles', 'nombre', solicitanteIds),
    mapaNombres('proveedores', 'nombre', proveedorIds),
  ])

  return filas.map((r: {
    id: string; numero_release: string; oca_id: string; area_id: string; solicitante_id: string
    monto_total: number; estado: string; facturado: boolean; numero_factura: string | null; created_at: string
  }) => ({
    id: r.id,
    numero_release: r.numero_release,
    numero_oca: numeroOcaPorId[r.oca_id] ?? '',
    proveedor_nombre: nombresProveedor[proveedorIdPorOca[r.oca_id]] ?? '',
    area_nombre: nombresArea[r.area_id] ?? '',
    solicitante_nombre: nombresSolicitante[r.solicitante_id] ?? '',
    monto_total: Number(r.monto_total),
    estado: r.estado,
    facturado: r.facturado,
    numero_factura: r.numero_factura,
    created_at: r.created_at,
  }))
}

// Spec: HU-023 CA-03 — solo releases 'aprobado' (mismo criterio que
// calcularPresupuestoConsumido(), HU-021), agregado por área.
export type FilaConsumoCentroCosto = { area_id: string; area_nombre: string; monto_consumido: number; cantidad_releases: number }

export async function obtenerConsumoPorCentroCosto(filtros: FiltrosReporteOca): Promise<FilaConsumoCentroCosto[]> {
  let query = adminClient().from('oca_releases').select('area_id, monto_total, oca_id, created_at').eq('estado', 'aprobado')
  if (filtros.oca_id) query = query.eq('oca_id', filtros.oca_id)
  if (filtros.desde) query = query.gte('created_at', filtros.desde)
  if (filtros.hasta) query = query.lte('created_at', filtros.hasta)

  const { data: releases } = await query
  let filas = releases ?? []

  if (filtros.proveedor_id) {
    const ocaIds = [...new Set(filas.map((r: { oca_id: string }) => r.oca_id))]
    const { data: ocas } = ocaIds.length > 0
      ? await adminClient().from('oca').select('id, proveedor_id').in('id', ocaIds)
      : { data: [] as { id: string; proveedor_id: string }[] }
    const ocaIdsDelProveedor = new Set((ocas ?? []).filter(o => o.proveedor_id === filtros.proveedor_id).map(o => o.id))
    filas = filas.filter((r: { oca_id: string }) => ocaIdsDelProveedor.has(r.oca_id))
  }

  const acumulado: Record<string, { monto: number; cantidad: number }> = {}
  for (const r of filas as { area_id: string; monto_total: number }[]) {
    if (!acumulado[r.area_id]) acumulado[r.area_id] = { monto: 0, cantidad: 0 }
    acumulado[r.area_id].monto += Number(r.monto_total)
    acumulado[r.area_id].cantidad += 1
  }

  const nombresArea = await mapaNombres('areas', 'nombre', Object.keys(acumulado))

  return Object.entries(acumulado)
    .map(([area_id, { monto, cantidad }]) => ({
      area_id,
      area_nombre: nombresArea[area_id] ?? '',
      monto_consumido: monto,
      cantidad_releases: cantidad,
    }))
    .sort((a, b) => b.monto_consumido - a.monto_consumido)
}

// Spec: HU-023 CA-04 — todas las enmiendas de todas las OCAs.
export type FilaHistoricoEnmienda = {
  id: string; numero_oca: string; tipo: string; estado: string
  solicitante_nombre: string; solicitado_en: string
  aprobador_nombre: string | null; aprobado_en: string | null; motivo_rechazo: string | null
}

export async function obtenerHistoricoEnmiendas(filtros: FiltrosReporteOca): Promise<FilaHistoricoEnmienda[]> {
  let query = adminClient().from('oca_enmiendas').select('*').order('solicitado_en', { ascending: false })
  if (filtros.oca_id) query = query.eq('oca_id', filtros.oca_id)
  if (filtros.enmienda_tipo) query = query.eq('tipo', filtros.enmienda_tipo)
  if (filtros.estado) query = query.eq('estado', filtros.estado)

  const { data: enmiendas } = await query
  const filas = enmiendas ?? []

  const ocaIds = [...new Set(filas.map((e: { oca_id: string }) => e.oca_id))]
  const solicitanteIds = [...new Set(filas.map((e: { solicitado_por_id: string }) => e.solicitado_por_id))]
  const aprobadorIds = [...new Set(filas.map((e: { aprobado_por_id: string | null }) => e.aprobado_por_id).filter(Boolean))] as string[]

  const [numerosOca, nombresSolicitante, nombresAprobador] = await Promise.all([
    mapaNombres('oca', 'numero_oca', ocaIds),
    mapaNombres('perfiles', 'nombre', solicitanteIds),
    mapaNombres('perfiles', 'nombre', aprobadorIds),
  ])

  return filas.map((e: {
    id: string; oca_id: string; tipo: string; estado: string
    solicitado_por_id: string; solicitado_en: string
    aprobado_por_id: string | null; aprobado_en: string | null; motivo_rechazo: string | null
  }) => ({
    id: e.id,
    numero_oca: numerosOca[e.oca_id] ?? '',
    tipo: e.tipo,
    estado: e.estado,
    solicitante_nombre: nombresSolicitante[e.solicitado_por_id] ?? '',
    solicitado_en: e.solicitado_en,
    aprobador_nombre: e.aprobado_por_id ? (nombresAprobador[e.aprobado_por_id] ?? null) : null,
    aprobado_en: e.aprobado_en,
    motivo_rechazo: e.motivo_rechazo,
  }))
}
