import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ROLES_OCS = ['compras', 'admin', 'asistente_compras', 'gerencia']

// Spec: SC-002 — evita el límite de URI de PostgREST/Kong en `.in()` con muchos
// IDs a la vez (mismo bug real encontrado y corregido en HU-016 sobre
// dashboard/cobertura/route.ts — aquí se aplica el mismo patrón preventivo).
const LOTE = 100

async function enLotes<T, R>(ids: T[], fn: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const resultados: R[] = []
  for (let i = 0; i < ids.length; i += LOTE) {
    resultados.push(...(await fn(ids.slice(i, i + LOTE))))
  }
  return resultados
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || !ROLES_OCS.includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { rol } = perfil
    const scope       = rol === 'asistente_compras' ? 'personal' : 'global'
    const areaParam   = req.nextUrl.searchParams.get('area')
    const yearParam   = req.nextUrl.searchParams.get('year')
    const filtroGasto = req.nextUrl.searchParams.get('filtro_gasto') ?? 'activas'

    const FILTRO_ESTADOS: Record<string, string[]> = {
      activas:       ['en_proceso', 'en_aprobacion_compras', 'en_aprobacion_gerencia', 'aprobada'],
      aprobadas:     ['aprobada'],
      comprometidas: ['en_proceso', 'en_aprobacion_compras', 'en_aprobacion_gerencia'],
    }
    const estadosFinancieros = FILTRO_ESTADOS[filtroGasto] ?? FILTRO_ESTADOS['activas']

    // Spec: SC-002 — ya no se filtra por registro_compras.area (texto legado,
    // queda NULL en OCs consolidadas desde HU-016) — el filtro por área se
    // aplica después, derivado vía el NP de origen de cada línea.
    let query = adminClient()
      .from('registro_compras')
      .select('id, estado_oc, valor_total, valor_a_pagar, created_at')

    if (scope === 'personal') {
      query = query.eq('creado_por_id', user.id)
    }

    if (yearParam) {
      query = query
        .gte('created_at', `${yearParam}-01-01T00:00:00`)
        .lte('created_at', `${yearParam}-12-31T23:59:59`)
    }

    const { data: ocsSinFiltrarArea, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Spec: SC-002 — deriva el área real de cada línea de OC vía su NP de
    // origen: items_oc -> items_np -> notas_pedido.area_id -> areas.nombre.
    // Cubre tanto OCs de una sola NP como consolidadas (HU-016), a diferencia
    // de leer registro_compras.area directamente (NULL en consolidadas, y el
    // dashboard las descartaba en silencio — bug preexistente cerrado de paso).
    const ocIds = (ocsSinFiltrarArea ?? []).map(oc => oc.id)

    const itemsOc = await enLotes(ocIds, async (lote) => {
      const { data } = await adminClient()
        .from('items_oc')
        .select('registro_compras_id, item_np_id, cantidad, precio_unitario')
        .in('registro_compras_id', lote)
      return data ?? []
    })

    const itemNpIds = [...new Set(itemsOc.map(i => i.item_np_id).filter(Boolean) as string[])]
    const npIdPorItemNp = new Map<string, string>()
    for (const row of await enLotes(itemNpIds, async (lote) => {
      const { data } = await adminClient().from('items_np').select('id, nota_pedido_id').in('id', lote)
      return data ?? []
    })) {
      npIdPorItemNp.set(row.id, row.nota_pedido_id)
    }

    const npIds = [...new Set([...npIdPorItemNp.values()])]
    const areaIdPorNp = new Map<string, string>()
    for (const row of await enLotes(npIds, async (lote) => {
      const { data } = await adminClient().from('notas_pedido').select('id, area_id').in('id', lote)
      return data ?? []
    })) {
      if (row.area_id) areaIdPorNp.set(row.id, row.area_id)
    }

    const areaIdsUsados = [...new Set([...areaIdPorNp.values()])]
    const nombrePorAreaId = new Map<string, string>()
    if (areaIdsUsados.length > 0) {
      const { data: areasUsadas } = await adminClient().from('areas').select('id, nombre').in('id', areaIdsUsados)
      for (const a of (areasUsadas ?? [])) nombrePorAreaId.set(a.id, a.nombre)
    }

    // Ítems agregados manualmente a la OC (sin item_np_id, HU-003) o cuya NP
    // aún no tiene area_id backfillado no aportan al breakdown por área —
    // quedan fuera, no rompen el cálculo.
    type LineaConArea = { registro_compras_id: string; area: string; valor: number }
    const lineasConArea: LineaConArea[] = []
    for (const item of itemsOc) {
      if (!item.item_np_id) continue
      const npId = npIdPorItemNp.get(item.item_np_id)
      if (!npId) continue
      const areaId = areaIdPorNp.get(npId)
      if (!areaId) continue
      const nombre = nombrePorAreaId.get(areaId)
      if (!nombre) continue
      lineasConArea.push({
        registro_compras_id: item.registro_compras_id,
        area:                nombre,
        valor:                Number(item.cantidad) * Number(item.precio_unitario || 0),
      })
    }

    // Filtro por área (mismo contrato que antes: ?area=<nombre>) — semántica
    // no-exclusiva: una OC consolidada con líneas de 2 áreas aparece al
    // filtrar por cualquiera de las dos (mismo criterio que ya usa nps_origen
    // de HU-016 — no se fuerza un área "dueña" única de la OC).
    let ocIdsFiltroArea: Set<string> | null = null
    if (areaParam && areaParam !== 'todas') {
      ocIdsFiltroArea = new Set(
        lineasConArea.filter(l => l.area === areaParam).map(l => l.registro_compras_id)
      )
    }

    const ocs = ocIdsFiltroArea
      ? (ocsSinFiltrarArea ?? []).filter(oc => ocIdsFiltroArea!.has(oc.id))
      : (ocsSinFiltrarArea ?? [])

    const ocIdsIncluidos = new Set(ocs.map(oc => oc.id))
    const estadoOcPorId  = new Map(ocs.map(oc => [oc.id, oc.estado_oc]))

    const byEstado:      Record<string, number> = {}
    const byEstadoValor: Record<string, number> = {}
    const byMesValor:    Record<string, number> = {}
    const yearsSet: Set<number> = new Set()
    let valorAprobado     = 0
    let gastoComprometido = 0
    let gastoTotalEmitido = 0

    const ESTADOS_COMPROMETIDOS = ['en_proceso', 'en_aprobacion_compras', 'en_aprobacion_gerencia']
    const ESTADOS_CANCELADOS    = ['rechazada', 'cancelada']

    for (const oc of ocs) {
      const valor = Number(oc.valor_a_pagar) || 0
      const enFiltro = estadosFinancieros.includes(oc.estado_oc)
      byEstado[oc.estado_oc] = (byEstado[oc.estado_oc] ?? 0) + 1
      if (enFiltro) byEstadoValor[oc.estado_oc] = (byEstadoValor[oc.estado_oc] ?? 0) + valor
      const mes = oc.created_at?.slice(0, 7)
      if (mes) {
        if (enFiltro) byMesValor[mes] = (byMesValor[mes] ?? 0) + valor
        yearsSet.add(Number(mes.slice(0, 4)))
      }
      if (oc.estado_oc === 'aprobada')                  valorAprobado     += valor
      if (ESTADOS_COMPROMETIDOS.includes(oc.estado_oc)) gastoComprometido += valor
      if (!ESTADOS_CANCELADOS.includes(oc.estado_oc))   gastoTotalEmitido += valor
    }

    // Spec: SC-002 — byArea cuenta OCs distintas que tocan cada área (no
    // exclusivo); byAreaValor suma el valor real por línea, no el total de
    // la OC — una OC consolidada aporta a cada área solo por sus líneas.
    const ocIdsPorArea: Record<string, Set<string>> = {}
    const byAreaValor:  Record<string, number>      = {}
    for (const linea of lineasConArea) {
      if (!ocIdsIncluidos.has(linea.registro_compras_id)) continue
      const estado = estadoOcPorId.get(linea.registro_compras_id)
      const enFiltro = estado ? estadosFinancieros.includes(estado) : false

      ocIdsPorArea[linea.area] ??= new Set()
      ocIdsPorArea[linea.area].add(linea.registro_compras_id)

      if (enFiltro) byAreaValor[linea.area] = (byAreaValor[linea.area] ?? 0) + linea.valor
    }
    const byArea: Record<string, number> = Object.fromEntries(
      Object.entries(ocIdsPorArea).map(([area, ids]) => [area, ids.size])
    )

    // Áreas disponibles para filtro (solo scope global) — mismo contrato de
    // siempre (string[] de nombres), ahora desde el catálogo `areas` (activo).
    let areas: string[] = []
    if (scope === 'global') {
      const { data: allAreas } = await adminClient().from('areas').select('nombre').eq('activo', true).order('nombre')
      areas = (allAreas ?? []).map(a => a.nombre)
    }

    return NextResponse.json({
      rol,
      scope,
      kpis: {
        total:               ocs.length,
        en_proceso:          byEstado['en_proceso']              ?? 0,
        en_aprobacion:       (byEstado['en_aprobacion_compras'] ?? 0) + (byEstado['en_aprobacion_gerencia'] ?? 0),
        aprobadas:           byEstado['aprobada']                ?? 0,
        rechazadas:          byEstado['rechazada']               ?? 0,
        canceladas:          byEstado['cancelada']               ?? 0,
        valor_aprobado:      valorAprobado,
        gasto_comprometido:  gastoComprometido,
        gasto_total_emitido: gastoTotalEmitido,
      },
      porEstado: Object.entries(byEstado).map(([estado, count]) => ({ estado, count, valor: byEstadoValor[estado] ?? 0 })),
      porArea:   Object.entries(byArea)
        .map(([area, count]) => ({ area, count, valor: byAreaValor[area] ?? 0 }))
        .sort((a, b) => b.count - a.count),
      porMes:    Object.entries(byMesValor)
        .map(([mes, valor]) => ({ mes, valor }))
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .slice(-12),
      years: [...yearsSet].sort((a, b) => b - a),
      areas,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
