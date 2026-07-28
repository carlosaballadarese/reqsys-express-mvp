import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ROLES_PERMITIDOS = ['compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']

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

    if (!perfil || !ROLES_PERMITIDOS.includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const areaParam = req.nextUrl.searchParams.get('area')
    const yearParam = req.nextUrl.searchParams.get('year')

    // Spec CA1: NPs en estados aprobada y completada, más los Estados de gestión de
    // HU-009 (en_gestion/oc_directa/oc_generada/oc_en_aprobacion/oc_aprobada) — una NP
    // con comprador asignado deja 'aprobada' de inmediato pero sigue siendo parte del
    // portafolio activo que este dashboard debe mostrar.
    let npQuery = adminClient()
      .from('notas_pedido')
      .select('id, numero, area, estado, prioridad, solicitante_nombre, created_at, completado_manualmente')
      .in('estado', [
        'aprobada', 'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada',
        'completada',
      ])

    // D2: asistente_compras ve solo las NPs que Compras le asignó
    if (perfil.rol === 'asistente_compras') {
      npQuery = npQuery.eq('asignado_a_id', user.id)
    }

    if (areaParam && areaParam !== 'todas') npQuery = npQuery.eq('area', areaParam)
    if (yearParam) {
      npQuery = npQuery
        .gte('created_at', `${yearParam}-01-01T00:00:00`)
        .lte('created_at', `${yearParam}-12-31T23:59:59`)
    }

    const { data: nps, error: npsError } = await npQuery
    if (npsError) return NextResponse.json({ error: npsError.message }, { status: 500 })
    if (!nps || nps.length === 0) return NextResponse.json({ nps: [] })

    const npIds = nps.map(np => np.id)

    // Query 2: ítems de estas NPs
    const { data: itemsNP } = await adminClient()
      .from('items_np')
      .select('id, nota_pedido_id, cantidad')
      .in('nota_pedido_id', npIds)

    const npItemIds = (itemsNP ?? []).map((item: { id: string }) => item.id)

    // Spec: HU-016 CA-10 (mismo criterio que lib/np-cobertura.ts::calcularCoberturaNP,
    // Decisión 6 de sdd-design.md — no se extrae función compartida, es cálculo bulk con
    // forma de query distinta) — el acumulado comprometido se calcula por
    // items_oc.item_np_id, NO por registro_compras.nota_pedido_id (NULL en OCs
    // consolidadas). Query 3: líneas de OC (de cualquier OC) que enlazan a estos ítems.
    //
    // Hallazgo de validación con datos reales (2026-07-27): a escala real (100+ NPs,
    // 300+ ítems) un solo .in('item_np_id', npItemIds) genera una URL que excede el
    // límite de PostgREST/Kong ("URI too long"), Supabase devuelve { data: null, error }
    // y el fetch original lo ignoraba en silencio (comprometido quedaba en 0 para TODAS
    // las NPs). Se agrupa en lotes — el Query 2 (NPs, cardinalidad menor) no lo necesita.
    const LOTE = 100
    async function itemsOcEnLotes(itemNpIds: string[]) {
      const filas: { item_np_id: string | null; cantidad: number; registro_compras_id: string }[] = []
      for (let i = 0; i < itemNpIds.length; i += LOTE) {
        const lote = itemNpIds.slice(i, i + LOTE)
        const { data, error } = await adminClient()
          .from('items_oc')
          .select('item_np_id, cantidad, registro_compras_id')
          .in('item_np_id', lote)
        if (error) { console.error('dashboard/cobertura — error en lote items_oc:', error); continue }
        filas.push(...(data ?? []))
      }
      return filas
    }

    const comprometidoMap: Record<string, number> = {}
    if (npItemIds.length > 0) {
      const itemsOCTodos = await itemsOcEnLotes(npItemIds)

      const ocIdsCandidatos = [...new Set(
        itemsOCTodos.map((it: { registro_compras_id: string }) => it.registro_compras_id)
      )]

      // Query 4: cuáles de esas OCs candidatas siguen vigentes
      if (ocIdsCandidatos.length > 0) {
        const { data: ocsValidas, error: errOcsValidas } = await adminClient()
          .from('registro_compras')
          .select('id')
          .in('id', ocIdsCandidatos)
          .neq('estado_oc', 'rechazada')
          .neq('estado_oc', 'cancelada')
        if (errOcsValidas) console.error('dashboard/cobertura — error al validar OCs:', errOcsValidas)

        const ocIdsValidos = new Set((ocsValidas ?? []).map((oc: { id: string }) => oc.id))

        for (const it of (itemsOCTodos ?? [])) {
          if (!it.item_np_id) continue
          if (!ocIdsValidos.has(it.registro_compras_id)) continue
          comprometidoMap[it.item_np_id] =
            (comprometidoMap[it.item_np_id] ?? 0) + Number(it.cantidad)
        }
      }
    }

    // Índice items_np por NP
    const itemsPorNP: Record<string, { id: string; cantidad: number }[]> = {}
    for (const item of (itemsNP ?? [])) {
      if (!itemsPorNP[item.nota_pedido_id]) itemsPorNP[item.nota_pedido_id] = []
      itemsPorNP[item.nota_pedido_id].push({ id: item.id, cantidad: Number(item.cantidad) })
    }

    // Spec CA1 + CA2 + CA-06: calcular porcentaje por NP; forzar 100% si completado_manualmente
    const result = nps.map(np => {
      const items              = itemsPorNP[np.id] ?? []
      const total_solicitado   = items.reduce((s, i) => s + i.cantidad, 0)
      const total_comprometido = items.reduce((s, i) => s + (comprometidoMap[i.id] ?? 0), 0)
      const esManual           = np.completado_manualmente ?? false

      // Spec CA-06: NP completada manualmente se fuerza a 100% en el dashboard
      const porcentaje_global = esManual ? 100 : (total_solicitado > 0
        ? (total_comprometido / total_solicitado) * 100
        : 0)
      const np_cubierta = esManual ? true : (total_solicitado > 0 && total_comprometido >= total_solicitado)

      return {
        id:                    np.id,
        numero:                np.numero,
        area:                  np.area,
        estado:                np.estado as string,
        prioridad:             np.prioridad,
        solicitante_nombre:    np.solicitante_nombre,
        created_at:            np.created_at,
        porcentaje_global,
        np_cubierta,
        total_solicitado,
        total_comprometido,
        completado_manualmente: esManual,
      }
    })

    return NextResponse.json({ nps: result })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
