import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { type Estado } from '@/lib/np-estado'
import { obtenerFeriadosEnRango, calcularTranscurridoLote } from '@/lib/np-sla'
import { puedeVerPrecioNP } from '@/lib/np-precio'
import {
  clasificarBadgeSLA,
  accionAgregadaDeFila,
  ocVivaDeLinea,
  aplicarMaskingPrecio,
  type SlaBadge,
} from '@/lib/np-vista'

// Spec: HU-011 CA-09
const ROLES_VISTA = ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta']

type AccionCatalogo = { id: string; orden: number; descripcion: string }

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()

    if (!perfil || !ROLES_VISTA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const area        = searchParams.get('area')
    const estado      = searchParams.get('estado')
    const prioridad   = searchParams.get('prioridad')
    const comprador   = searchParams.get('comprador')
    const accionId    = searchParams.get('accion')
    const slaFiltro   = searchParams.get('sla') as SlaBadge | null
    const solicitante = searchParams.get('solicitante')?.trim()
    const numero      = searchParams.get('numero')?.trim()
    const descripcion = searchParams.get('descripcion')?.trim()

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
    query = query.or(`estado.neq.borrador,creado_por_id.eq.${user.id}`)

    const { data: npsBase, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Spec CA-01, CA-02 — se cargan siempre, aunque el resultado filtrado quede vacío
    const [{ data: catalogoRaw }, { data: compradoresRaw }] = await Promise.all([
      adminClient().from('acciones_gestion').select('id, orden, descripcion').order('orden'),
      adminClient().from('perfiles').select('id, nombre')
        .in('rol', ['asistente_compras', 'compras']).eq('activo', true).order('nombre'),
    ])

    const catalogoMap = new Map<string, AccionCatalogo>((catalogoRaw ?? []).map((a: AccionCatalogo) => [a.id, a]))
    const accionesCatalogo: AccionCatalogo[] = catalogoRaw ?? []
    const compradoresDisponibles = compradoresRaw ?? []

    if (!npsBase || npsBase.length === 0) {
      return NextResponse.json({ rows: [], compradoresDisponibles, accionesCatalogo })
    }

    const npIds = npsBase.map((np: any) => np.id)

    const { data: itemsNpRaw } = await adminClient()
      .from('items_np')
      .select('id, nota_pedido_id, linea, descripcion, cantidad, precio_unitario, accion_id')
      .in('nota_pedido_id', npIds)
      .order('linea')

    const itemsNp = itemsNpRaw ?? []
    const itemIds = itemsNp.map((i: any) => i.id)

    // Spec CA-03, RN-02 — solo OCs vivas cubren una línea a estos efectos
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

    // Spec: nota de diseño — una sola consulta a feriados para todo el lote
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

    let rows = npsBase.map((np: any) => {
      const verPrecio = puedeVerPrecioNP(perfil.rol, np.es_regularizacion ?? false, np.creado_por_id, user.id)
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
      if (!np.sla_iniciado_en) {
        sla_badge = clasificarBadgeSLA({
          estado: np.estado as Estado, slaIniciadoEn: null, slaPausadoDesde: null,
          transcurridoMs: null, plazoMs: null,
        })
      } else {
        const { transcurridoMs, plazoMs } = calcularTranscurridoLote({
          prioridad:              np.prioridad,
          slaIniciadoEn:          np.sla_iniciado_en,
          slaPausadoDesde:        np.sla_pausado_desde,
          slaPausadoAcumuladoSeg: np.sla_pausado_acumulado_seg,
          feriados,
        })
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
        accion_agregada: accionAgregadaDeFila(
          np.estado as Estado,
          lineasRaw.map((l: any) => ({ accion_id: l.accion_id })),
          catalogoMap
        ),
        lineas,
      }
    })

    // Spec CA-02 — filtros derivados, no son columnas de BD
    if (accionId && estado === 'en_gestion') {
      rows = rows.filter((f: any) => f.accion_agregada?.id === accionId)
    }
    if (slaFiltro) {
      rows = rows.filter((f: any) => f.sla_badge === slaFiltro)
    }

    return NextResponse.json({ rows, compradoresDisponibles, accionesCatalogo })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
