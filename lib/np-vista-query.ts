import { adminClient } from '@/lib/supabase/clients'
import { type Estado } from '@/lib/np-estado'
import { obtenerFeriadosEnRango, calcularTranscurridoLote } from '@/lib/np-sla'
import { puedeVerPrecioNP } from '@/lib/np-precio'
import {
  clasificarBadgeSLA,
  accionAgregadaDeFila,
  ocVivaDeLinea,
  aplicarMaskingPrecio,
  calcularSlaDiasSigno,
  type SlaBadge,
} from '@/lib/np-vista'

// Spec: HU-011 CA-09
export const ROLES_VISTA = ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta']

export type AccionCatalogo = { id: string; orden: number; descripcion: string }

export type FiltrosVista = {
  area?: string | null
  estado?: string | null
  prioridad?: string | null
  comprador?: string | null
  accionId?: string | null
  slaFiltro?: SlaBadge | null
  solicitante?: string | null
  numero?: string | null
  descripcion?: string | null
}

export type LineaVistaNP = {
  id: string
  linea: number
  descripcion: string
  cantidad: number
  precio_unitario: number | null
  accion: AccionCatalogo | null
  oc: { id: string; numero_oc: string } | null
}

export type FilaVistaNP = {
  id: string
  numero: string
  created_at: string
  area: string
  solicitante_nombre: string
  descripcion_general: string | null
  prioridad: string
  estado: string
  asignado_a: string | null
  asignado_nombre: string | null
  total_estimado: number | null
  sla_badge: SlaBadge
  sla_dias_signo: number | null
  accion_agregada: AccionCatalogo | null
  lineas: LineaVistaNP[]
}

export type ResultadoVista = {
  rows: FilaVistaNP[]
  compradoresDisponibles: { id: string; nombre: string }[]
  accionesCatalogo: AccionCatalogo[]
}

// Spec: HU-013 Tarea 1 — extracción pura de np-lineas-pendientes-query.ts para no
// duplicar estas dos queries; obtenerFilasVista() la usa internamente sin cambio de
// comportamiento (validado con los tests existentes sin modificar sus aserciones).
export async function obtenerCatalogosVista(): Promise<{
  compradoresDisponibles: { id: string; nombre: string }[]
  accionesCatalogo: AccionCatalogo[]
}> {
  const [{ data: catalogoRaw }, { data: compradoresRaw }] = await Promise.all([
    adminClient().from('acciones_gestion').select('id, orden, descripcion').order('orden'),
    adminClient().from('perfiles').select('id, nombre')
      .in('rol', ['asistente_compras', 'compras']).eq('activo', true).order('nombre'),
  ])
  return {
    accionesCatalogo: catalogoRaw ?? [],
    compradoresDisponibles: compradoresRaw ?? [],
  }
}

// Spec: HU-012 — parseo de query params compartido entre GET /vista (JSON) y
// GET /vista/excel, para que ambos endpoints acepten exactamente los mismos filtros.
export function parsearFiltrosVista(searchParams: URLSearchParams): FiltrosVista {
  return {
    area:        searchParams.get('area'),
    estado:      searchParams.get('estado'),
    prioridad:   searchParams.get('prioridad'),
    comprador:   searchParams.get('comprador'),
    accionId:    searchParams.get('accion'),
    slaFiltro:   searchParams.get('sla') as SlaBadge | null,
    solicitante: searchParams.get('solicitante')?.trim(),
    numero:      searchParams.get('numero')?.trim(),
    descripcion: searchParams.get('descripcion')?.trim(),
  }
}

// Spec: HU-011 (extraído tal cual de app/api/compras/nps/vista/route.ts en HU-012,
// Tarea 1 — refactor de extracción, sin cambio de comportamiento) + HU-012 Tarea 2
// (agrega sla_dias_signo a cada fila).
export async function obtenerFilasVista(
  filtros: FiltrosVista,
  userId: string,
  rol: string
): Promise<ResultadoVista> {
  const { area, estado, prioridad, comprador, accionId, slaFiltro, solicitante, numero, descripcion } = filtros

  const SELECT_NP = 'id, numero, created_at, area, solicitante_nombre, descripcion_general, prioridad, estado, asignado_a, asignado_nombre, total_estimado, es_regularizacion, creado_por_id, sla_iniciado_en, sla_pausado_desde, sla_pausado_acumulado_seg'

  let query = adminClient().from('notas_pedido').select(SELECT_NP).order('created_at', { ascending: false })

  if (area && area !== 'todas') query = query.eq('area', area)
  if (estado && estado !== 'todos') query = query.eq('estado', estado)
  if (prioridad && prioridad !== 'todas') query = query.eq('prioridad', prioridad)
  if (comprador && comprador !== 'todos') query = query.eq('asignado_a', comprador)
  if (solicitante) query = query.ilike('solicitante_nombre', `%${solicitante}%`)
  if (numero) query = query.ilike('numero', `%${numero}%`)
  if (descripcion) query = query.ilike('descripcion_general', `%${descripcion}%`)

  // Spec: HU-009 CA-15 — un Borrador es visible únicamente para su creador,
  // sin importar el rol (mismo criterio que GET /api/compras/nps).
  query = query.or(`estado.neq.borrador,creado_por_id.eq.${userId}`)

  const { data: npsBase, error } = await query
  if (error) throw new Error(error.message)

  // Spec CA-01, CA-02 — se cargan siempre, aunque el resultado filtrado quede vacío
  const { accionesCatalogo, compradoresDisponibles } = await obtenerCatalogosVista()
  const catalogoMap = new Map<string, AccionCatalogo>(accionesCatalogo.map((a) => [a.id, a]))

  if (!npsBase || npsBase.length === 0) {
    return { rows: [], compradoresDisponibles, accionesCatalogo }
  }

  const npIds = npsBase.map((np: any) => np.id)

  const { data: itemsNpRaw } = await adminClient()
    .from('items_np')
    .select('id, nota_pedido_id, linea, descripcion, cantidad, precio_unitario, accion_id')
    .in('nota_pedido_id', npIds)
    .order('linea')

  const itemsNp = itemsNpRaw ?? []
  const itemIds = itemsNp.map((i: any) => i.id)

  // Spec CA-03, RN-02 (HU-011) — solo OCs vivas cubren una línea a estos efectos
  const ocsPorItem = new Map<string, { id: string; numero_oc: string; estado_oc: string }[]>()
  if (itemIds.length > 0) {
    const { data: itemsOc } = await adminClient()
      .from('items_oc')
      .select('item_np_id, registro_compras_id')
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
      lista.push({ id: oc.id, numero_oc: oc.numero_oc, estado_oc: oc.estado_oc })
      ocsPorItem.set(io.item_np_id, lista)
    }
  }

  // Spec: nota de diseño (HU-011) — una sola consulta a feriados para todo el lote
  const conSla = npsBase.filter((np: any) => np.sla_iniciado_en)
  let feriados = new Set<string>()
  if (conSla.length > 0) {
    const minInicio = conSla.reduce((min: string, np: any) =>
      np.sla_iniciado_en < min ? np.sla_iniciado_en : min, conSla[0].sla_iniciado_en)
    feriados = await obtenerFeriadosEnRango(new Date(minInicio), new Date())
  }

  const itemsPorNP = new Map<string, typeof itemsNp>()
  for (const item of itemsNp) {
    const lista = itemsPorNP.get(item.nota_pedido_id) ?? []
    lista.push(item)
    itemsPorNP.set(item.nota_pedido_id, lista)
  }

  let rows: FilaVistaNP[] = npsBase.map((np: any) => {
    const verPrecio = puedeVerPrecioNP(rol, np.es_regularizacion ?? false, np.creado_por_id, userId)
    const lineasRaw = itemsPorNP.get(np.id) ?? []

    const lineas = lineasRaw.map((item: any) => {
      const masked = aplicarMaskingPrecio(item, verPrecio)
      return {
        id:              item.id,
        linea:           item.linea,
        descripcion:     item.descripcion,
        cantidad:        item.cantidad,
        precio_unitario: masked.precio_unitario,
        accion:          item.accion_id ? (catalogoMap.get(item.accion_id) ?? null) : null,
        oc:              ocVivaDeLinea(item.id, ocsPorItem),
      }
    })

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

    return {
      id:                  np.id,
      numero:              np.numero,
      created_at:          np.created_at,
      area:                np.area,
      solicitante_nombre:  np.solicitante_nombre,
      descripcion_general: np.descripcion_general,
      prioridad:           np.prioridad,
      estado:              np.estado,
      asignado_a:          np.asignado_a,
      asignado_nombre:     np.asignado_nombre,
      total_estimado:      verPrecio ? np.total_estimado : null,
      sla_badge,
      sla_dias_signo: calcularSlaDiasSigno(sla_badge, transcurridoMs, plazoMs),
      accion_agregada: accionAgregadaDeFila(
        np.estado as Estado,
        lineasRaw.map((l: any) => ({ accion_id: l.accion_id })),
        catalogoMap
      ),
      lineas,
    }
  })

  // Spec CA-02 (HU-011) — filtros derivados, no son columnas de BD
  if (accionId && estado === 'en_gestion') {
    rows = rows.filter((f) => f.accion_agregada?.id === accionId)
  }
  if (slaFiltro) {
    rows = rows.filter((f) => f.sla_badge === slaFiltro)
  }

  return { rows, compradoresDisponibles, accionesCatalogo }
}
