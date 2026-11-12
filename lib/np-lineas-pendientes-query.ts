import { adminClient } from '@/lib/supabase/clients'
import { type Estado, ESTADOS_OC_VIVOS } from '@/lib/np-estado'
import { obtenerFeriadosEnRango, calcularTranscurridoLote } from '@/lib/np-sla'
import { puedeVerPrecioNP } from '@/lib/np-precio'
import {
  clasificarBadgeSLA,
  ocaVivaDeLinea,
  aplicarMaskingPrecio,
  calcularSlaDiasSigno,
  type SlaBadge,
} from '@/lib/np-vista'
import { obtenerCatalogosVista, type AccionCatalogo } from '@/lib/np-vista-query'

// Spec: HU-013 CA-06
export const ROLES_LINEAS_PENDIENTES = ['compras', 'admin', 'asistente_compras']

// Spec: HU-013 CA-01 — único subconjunto de Estados donde puede existir una línea sin
// OC viva. calcularEstadoDestino() (lib/np-estado.ts) solo avanza una NP a
// oc_generada/oc_en_aprobacion/oc_aprobada cuando TODAS sus líneas ya están cubiertas
// por una OC viva — ninguna NP en esos 3 Estados posteriores puede tener líneas pendientes.
export const ESTADOS_LINEAS_PENDIENTES: Estado[] = ['aprobada', 'en_gestion', 'oc_directa']

export type FiltrosLineasPendientes = {
  area?: string | null
  estado?: string | null
  prioridad?: string | null
  comprador?: string | null
  accionId?: string | null
  slaFiltro?: SlaBadge | null
  proveedor?: string | null
  material?: string | null
}

export type LineaPendiente = {
  item_id: string
  np_id: string
  np_numero: string
  np_created_at: string
  area: string
  solicitante_nombre: string
  prioridad: string
  estado: string
  asignado_a: string | null
  asignado_nombre: string | null
  linea: number
  codigo: string | null
  unidad: string
  descripcion: string
  cantidad: number        // Spec: SC-012 — saldo disponible (cantidad_total - comprometido por OC viva), no la cantidad total
  cantidad_total: number  // Spec: SC-012 — cantidad original de la línea (items_np.cantidad)
  proveedor_sugerido: string | null
  precio_unitario: number | null
  total_estimado: number | null
  sla_badge: SlaBadge
  sla_dias_signo: number | null
  accion: AccionCatalogo | null
}

export type ResultadoLineasPendientes = {
  rows: LineaPendiente[]
  compradoresDisponibles: { id: string; nombre: string }[]
  accionesCatalogo: AccionCatalogo[]
  proveedoresDisponibles: string[]
}

// Spec: SC-012 RN-02/RN-03/RN-04 — espejo en lote de ItemCobertura
// (lib/np-cobertura.ts::calcularCoberturaNP()), sin llamar a esa función por NP
// (evitaría el antipatrón N+1 ya corregido varias veces en este proyecto).
// Una OCA viva sigue comprometiendo el 100% de la línea (binario, RN-03);
// de lo contrario, el comprometido es la suma de cantidad de las OCs vivas.
function calcularSaldoLinea(
  itemId: string,
  cantidadTotal: number,
  ocsPorItem: Map<string, { estado_oc: string; cantidad: number }[]>,
  ocasPorItem: Map<string, { id: string; numero_oca: string; estado: string }[]>
): number {
  if (ocaVivaDeLinea(itemId, ocasPorItem) !== null) return 0

  const comprometido = (ocsPorItem.get(itemId) ?? [])
    .filter(oc => ESTADOS_OC_VIVOS.includes(oc.estado_oc))
    .reduce((sum, oc) => sum + Number(oc.cantidad), 0)

  return Math.max(0, cantidadTotal - comprometido)
}

// Spec: HU-013 CA-02
export function parsearFiltrosLineasPendientes(searchParams: URLSearchParams): FiltrosLineasPendientes {
  return {
    area:       searchParams.get('area'),
    estado:     searchParams.get('estado'),
    prioridad:  searchParams.get('prioridad'),
    comprador:  searchParams.get('comprador'),
    accionId:   searchParams.get('accion'),
    slaFiltro:  searchParams.get('sla') as SlaBadge | null,
    proveedor:  searchParams.get('proveedor')?.trim(),
    material:   searchParams.get('material')?.trim(),
  }
}

// Spec: HU-013 CA-01 a CA-05
export async function obtenerLineasPendientes(
  filtros: FiltrosLineasPendientes,
  userId: string,
  rol: string
): Promise<ResultadoLineasPendientes> {
  const { area, estado, prioridad, comprador, accionId, slaFiltro, proveedor, material } = filtros

  const SELECT_NP = 'id, numero, created_at, area, solicitante_nombre, prioridad, estado, asignado_a, asignado_nombre, total_estimado, es_regularizacion, creado_por_id, sla_iniciado_en, sla_pausado_desde, sla_pausado_acumulado_seg'

  // Spec CA-01 — baseline fijo: solo Estados donde puede existir una línea pendiente
  let query = adminClient().from('notas_pedido').select(SELECT_NP)
    .in('estado', ESTADOS_LINEAS_PENDIENTES)
    .order('created_at', { ascending: false })

  if (area && area !== 'todas') query = query.eq('area', area)
  if (estado && estado !== 'todos') query = query.eq('estado', estado)
  if (prioridad && prioridad !== 'todas') query = query.eq('prioridad', prioridad)
  if (comprador && comprador !== 'todos') query = query.eq('asignado_a', comprador)

  const { data: npsBase, error } = await query
  if (error) throw new Error(error.message)

  const { accionesCatalogo, compradoresDisponibles } = await obtenerCatalogosVista()
  const catalogoMap = new Map<string, AccionCatalogo>(accionesCatalogo.map((a) => [a.id, a]))

  if (!npsBase || npsBase.length === 0) {
    return { rows: [], compradoresDisponibles, accionesCatalogo, proveedoresDisponibles: [] }
  }

  const npIds = npsBase.map((np: any) => np.id)

  // Spec CA-03 — incluye proveedor_sugerido, no seleccionado por obtenerFilasVista() (HU-011).
  // codigo/unidad (HU-014): requeridos para construir items[] de POST /convertir/[id].
  const { data: itemsNpRaw } = await adminClient()
    .from('items_np')
    .select('id, nota_pedido_id, linea, codigo, unidad, descripcion, cantidad, precio_unitario, accion_id, proveedor_sugerido')
    .in('nota_pedido_id', npIds)
    .order('linea')

  const itemsNp = itemsNpRaw ?? []
  const itemIds = itemsNp.map((i: any) => i.id)

  // Spec CA-01, mismo criterio "OC viva" que HU-011 RN-02; cantidad (SC-012)
  // necesaria para calcularSaldoLinea().
  const ocsPorItem = new Map<string, { id: string; numero_oc: string; estado_oc: string; cantidad: number }[]>()
  if (itemIds.length > 0) {
    const { data: itemsOc } = await adminClient()
      .from('items_oc')
      .select('item_np_id, registro_compras_id, cantidad')
      .in('item_np_id', itemIds)

    const ocIds = [...new Set((itemsOc ?? []).map((io: any) => io.registro_compras_id))]
    const { data: ocs } = ocIds.length > 0
      ? await adminClient().from('registro_compras').select('id, numero_oc, estado_oc').in('id', ocIds)
      : { data: [] as { id: string; numero_oc: string; estado_oc: string }[] }

    const ocPorId = new Map((ocs ?? []).map((oc: any) => [oc.id, oc]))
    for (const io of (itemsOc ?? [])) {
      const oc = ocPorId.get(io.registro_compras_id)
      if (!oc) continue
      const lista = ocsPorItem.get(io.item_np_id) ?? []
      lista.push({ id: oc.id, numero_oc: oc.numero_oc, estado_oc: oc.estado_oc, cantidad: Number(io.cantidad) })
      ocsPorItem.set(io.item_np_id, lista)
    }
  }

  // Spec: HU-019 CA-05 — mismo criterio "OCA viva" (RN-01), consultado junto a
  // la de OC para excluir líneas cubiertas por cualquiera de los dos canales.
  const ocasPorItem = new Map<string, { id: string; numero_oca: string; estado: string }[]>()
  if (itemIds.length > 0) {
    const { data: ocaItems } = await adminClient()
      .from('oca_items')
      .select('item_np_id, oca_id')
      .in('item_np_id', itemIds)
      .not('item_np_id', 'is', null)

    const ocaIds = [...new Set((ocaItems ?? []).map((io: any) => io.oca_id))]
    const { data: ocasData } = ocaIds.length > 0
      ? await adminClient().from('oca').select('id, numero_oca, estado').in('id', ocaIds)
      : { data: [] as { id: string; numero_oca: string; estado: string }[] }

    const ocaPorId = new Map((ocasData ?? []).map((oca: any) => [oca.id, oca]))
    for (const io of (ocaItems ?? [])) {
      if (!io.item_np_id) continue
      const oca = ocaPorId.get(io.oca_id)
      if (!oca) continue
      const lista = ocasPorItem.get(io.item_np_id) ?? []
      lista.push({ id: oca.id, numero_oca: oca.numero_oca, estado: oca.estado })
      ocasPorItem.set(io.item_np_id, lista)
    }
  }

  // Spec: nota de diseño (HU-011, reutilizada) — una sola consulta a feriados para todo el lote
  const conSla = npsBase.filter((np: any) => np.sla_iniciado_en)
  let feriados = new Set<string>()
  if (conSla.length > 0) {
    const minInicio = conSla.reduce((min: string, np: any) =>
      np.sla_iniciado_en < min ? np.sla_iniciado_en : min, conSla[0].sla_iniciado_en)
    feriados = await obtenerFeriadosEnRango(new Date(minInicio), new Date())
  }

  const npPorId = new Map(npsBase.map((np: any) => [np.id, np]))

  // Spec: SC-012 CA-01/RN-01 — aplanado a nivel de línea; se descartan las que
  // no tienen saldo disponible (antes: se descartaba ante cualquier OC viva,
  // sin mirar cantidad).
  let rows: LineaPendiente[] = []
  for (const item of itemsNp) {
    const np: any = npPorId.get(item.nota_pedido_id)
    if (!np) continue
    const cantidadTotal = Number(item.cantidad)
    const saldo = calcularSaldoLinea(item.id, cantidadTotal, ocsPorItem, ocasPorItem)
    if (saldo <= 0) continue

    const verPrecio = puedeVerPrecioNP(rol, np.es_regularizacion ?? false, np.creado_por_id, userId)
    const masked = aplicarMaskingPrecio(item, verPrecio)

    let sla_badge: SlaBadge
    let transcurridoMs: number | null = null
    let plazoMs: number | null = null
    if (!np.sla_iniciado_en) {
      sla_badge = clasificarBadgeSLA({
        estado: np.estado as Estado, slaIniciadoEn: null, slaPausadoDesde: null,
        transcurridoMs: null, plazoMs: null,
      })
    } else {
      ;({ transcurridoMs, plazoMs } = calcularTranscurridoLote({
        prioridad:              np.prioridad,
        slaIniciadoEn:          np.sla_iniciado_en,
        slaPausadoDesde:        np.sla_pausado_desde,
        slaPausadoAcumuladoSeg: np.sla_pausado_acumulado_seg,
        feriados,
      }))
      sla_badge = clasificarBadgeSLA({
        estado: np.estado as Estado, slaIniciadoEn: np.sla_iniciado_en, slaPausadoDesde: np.sla_pausado_desde,
        transcurridoMs, plazoMs,
      })
    }

    // Spec CA-03 — Acción por línea individual, no agregada por NP (a diferencia de
    // HU-011); RN-05 de HU-009: oc_directa no usa Acciones, queda "—" en la UI.
    const accion = np.estado === 'en_gestion' && item.accion_id
      ? (catalogoMap.get(item.accion_id) ?? null)
      : null

    rows.push({
      item_id:             item.id,
      np_id:               np.id,
      np_numero:           np.numero,
      np_created_at:       np.created_at,
      area:                np.area,
      solicitante_nombre:  np.solicitante_nombre,
      prioridad:           np.prioridad,
      estado:              np.estado,
      asignado_a:          np.asignado_a,
      asignado_nombre:     np.asignado_nombre,
      linea:               item.linea,
      codigo:              item.codigo,
      unidad:              item.unidad,
      descripcion:         item.descripcion,
      cantidad:            saldo,         // Spec: SC-012 — saldo disponible, no la cantidad total
      cantidad_total:      cantidadTotal, // Spec: SC-012
      proveedor_sugerido:  item.proveedor_sugerido,
      precio_unitario:     masked.precio_unitario,
      total_estimado:      verPrecio ? np.total_estimado : null,
      sla_badge,
      sla_dias_signo: calcularSlaDiasSigno(sla_badge, transcurridoMs, plazoMs),
      accion,
    })
  }

  // Spec CA-02 — filtros derivados (Acción/SLA), aplicados sobre las filas ya planas.
  // Mismo criterio que HU-011: el filtro de Acción se ignora salvo que el propio
  // filtro de Estado esté fijado en 'en_gestion' (única condición en la que existen
  // líneas con Acción asignable).
  if (accionId && estado === 'en_gestion') {
    rows = rows.filter((f) => f.accion?.id === accionId)
  }
  if (slaFiltro) {
    rows = rows.filter((f) => f.sla_badge === slaFiltro)
  }

  // Spec: decisión de diseño — proveedoresDisponibles se calcula ANTES del filtro
  // propio de Proveedor/Material (faceted search: la opción elegida no se autoelimina).
  const proveedoresDisponibles = [...new Set(
    rows.map((r) => r.proveedor_sugerido).filter((p): p is string => !!p && p.trim() !== '')
  )].sort()

  if (proveedor) {
    const buscado = proveedor.toLowerCase()
    rows = rows.filter((r) => (r.proveedor_sugerido ?? '').toLowerCase().includes(buscado))
  }
  if (material) {
    const buscado = material.toLowerCase()
    rows = rows.filter((r) => r.descripcion.toLowerCase().includes(buscado))
  }

  return { rows, compradoresDisponibles, accionesCatalogo, proveedoresDisponibles }
}
