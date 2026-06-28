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

    // Spec CA1: NPs en estados aprobada y completada
    let npQuery = adminClient()
      .from('notas_pedido')
      .select('id, numero, area, estado, prioridad, solicitante_nombre, created_at, completado_manualmente')
      .in('estado', ['aprobada', 'completada'])

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

    // Spec F1: bulk calculation — queries 2 y 3 en paralelo
    const [{ data: itemsNP }, { data: ocsValidas }] = await Promise.all([
      adminClient()
        .from('items_np')
        .select('id, nota_pedido_id, cantidad')
        .in('nota_pedido_id', npIds),
      adminClient()
        .from('registro_compras')
        .select('id, nota_pedido_id')
        .in('nota_pedido_id', npIds)
        .neq('estado_oc', 'rechazada')
        .neq('estado_oc', 'cancelada'),
    ])

    const ocIds = (ocsValidas ?? []).map((oc: { id: string }) => oc.id)

    // Query 4: cantidades comprometidas en items_oc
    const comprometidoMap: Record<string, number> = {}
    if (ocIds.length > 0) {
      const { data: itemsOC } = await adminClient()
        .from('items_oc')
        .select('item_np_id, cantidad')
        .in('registro_compras_id', ocIds)

      for (const it of (itemsOC ?? [])) {
        if (!it.item_np_id) continue
        comprometidoMap[it.item_np_id] =
          (comprometidoMap[it.item_np_id] ?? 0) + Number(it.cantidad)
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
        estado:                np.estado as 'aprobada' | 'completada',
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
