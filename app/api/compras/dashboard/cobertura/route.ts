import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ESTADOS_OCA_VIVAS } from '@/lib/oca-estado'

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
        // Spec: HU-019 CA-09 — sin esto, una NP cubierta (parcial o totalmente)
        // por una OCA desaparecía por completo de este dashboard.
        'oca_generada', 'oca_oc_generada',
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

    // Spec: hallazgo real 2026-11-10 (mismo patrón de HU-016 CA-10) — a escala
    // real de producción (306 NPs calificadas) un solo .in('nota_pedido_id',
    // npIds) excede el límite de URI del gateway PostgREST/Kong ("URI too
    // long"); el error se ignoraba en silencio (`const { data }` sin
    // desestructurar `error`), dejando `itemsNP` en `null` y por lo tanto
    // total_solicitado=0 para TODAS las NPs sin excepción. El comentario
    // original de más abajo ("Query 2, cardinalidad menor, no lo necesita")
    // ya no es cierto a esta escala — se agrupa en lotes igual que items_oc/
    // oca_items.
    const LOTE = 100
    async function itemsNpEnLotes(ids: string[]) {
      const filas: { id: string; nota_pedido_id: string; cantidad: number }[] = []
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE)
        const { data, error } = await adminClient()
          .from('items_np')
          .select('id, nota_pedido_id, cantidad')
          .in('nota_pedido_id', lote)
        if (error) { console.error('dashboard/cobertura — error en lote items_np:', error); continue }
        filas.push(...(data ?? []))
      }
      return filas
    }

    const itemsNP = await itemsNpEnLotes(npIds)
    const npItemIds = itemsNP.map((item: { id: string }) => item.id)

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
    // las NPs). Se agrupa en lotes (LOTE ya declarado arriba, reutilizado por
    // itemsNpEnLotes/itemsOcEnLotes/ocaItemsEnLotes).
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
        // Spec: hallazgo real 2026-11-10 — mismo patrón que itemsNpEnLotes:
        // a escala real (287 OCs) un solo .in('id', ocIdsCandidatos) también
        // excedía el límite de URI ("URI too long", confirmado en el log del
        // servidor), dejando ocIdsValidos vacío y por lo tanto
        // total_comprometido=0 para TODAS las NPs sin excepción, sin importar
        // que items_oc sí tuviera la OC real vinculada.
        const ocsValidas: { id: string }[] = []
        for (let i = 0; i < ocIdsCandidatos.length; i += LOTE) {
          const lote = ocIdsCandidatos.slice(i, i + LOTE)
          const { data, error } = await adminClient()
            .from('registro_compras')
            .select('id')
            .in('id', lote)
            .neq('estado_oc', 'rechazada')
            .neq('estado_oc', 'cancelada')
          if (error) { console.error('dashboard/cobertura — error en lote registro_compras:', error); continue }
          ocsValidas.push(...(data ?? []))
        }

        const ocIdsValidos = new Set(ocsValidas.map((oc: { id: string }) => oc.id))

        for (const it of (itemsOCTodos ?? [])) {
          if (!it.item_np_id) continue
          if (!ocIdsValidos.has(it.registro_compras_id)) continue
          comprometidoMap[it.item_np_id] =
            (comprometidoMap[it.item_np_id] ?? 0) + Number(it.cantidad)
        }
      }
    }

    // Spec: HU-019 CA-09 — cobertura vía OCA. A diferencia de items_oc, oca_items
    // no tiene columna "cantidad" (HU-018 CA-03 — la cantidad se define en el
    // release, Fase D futura): una línea vinculada a una OCA viva se trata como
    // 100% comprometida para sí misma (mismo criterio que calcularEstadoDestino()
    // en lib/np-estado.ts — la línea se considera cubierta sin importar volumen).
    if (npItemIds.length > 0) {
      const cantidadPorItemNp: Record<string, number> = {}
      for (const item of (itemsNP ?? [])) cantidadPorItemNp[item.id] = Number(item.cantidad)

      async function ocaItemsEnLotes(itemNpIds: string[]) {
        const filas: { item_np_id: string | null; oca_id: string }[] = []
        for (let i = 0; i < itemNpIds.length; i += LOTE) {
          const lote = itemNpIds.slice(i, i + LOTE)
          const { data, error } = await adminClient()
            .from('oca_items')
            .select('item_np_id, oca_id')
            .in('item_np_id', lote)
            .not('item_np_id', 'is', null)
          if (error) { console.error('dashboard/cobertura — error en lote oca_items:', error); continue }
          filas.push(...(data ?? []))
        }
        return filas
      }

      const ocaItemsTodos = await ocaItemsEnLotes(npItemIds)
      const ocaIdsCandidatos = [...new Set(ocaItemsTodos.map(it => it.oca_id))]

      if (ocaIdsCandidatos.length > 0) {
        // Mismo patrón defensivo de lotes que registro_compras/items_np/items_oc
        // arriba — hoy con 1 sola OCA real no se manifiesta, pero es el mismo
        // riesgo ya confirmado dos veces en este archivo a escala real.
        const ocasValidas: { id: string; estado: string }[] = []
        for (let i = 0; i < ocaIdsCandidatos.length; i += LOTE) {
          const lote = ocaIdsCandidatos.slice(i, i + LOTE)
          const { data, error } = await adminClient().from('oca').select('id, estado').in('id', lote)
          if (error) { console.error('dashboard/cobertura — error en lote oca:', error); continue }
          ocasValidas.push(...(data ?? []))
        }

        const ocaIdsVivos = new Set(
          ocasValidas.filter(oca => (ESTADOS_OCA_VIVAS as string[]).includes(oca.estado)).map(oca => oca.id)
        )

        for (const it of ocaItemsTodos) {
          if (!it.item_np_id || !ocaIdsVivos.has(it.oca_id)) continue
          comprometidoMap[it.item_np_id] =
            (comprometidoMap[it.item_np_id] ?? 0) + (cantidadPorItemNp[it.item_np_id] ?? 0)
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
