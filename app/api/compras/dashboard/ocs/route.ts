import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ROLES_OCS = ['compras', 'admin', 'asistente_compras', 'gerencia']

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
    const scope     = rol === 'asistente_compras' ? 'personal' : 'global'
    const areaParam = req.nextUrl.searchParams.get('area')
    const yearParam = req.nextUrl.searchParams.get('year')

    let query = adminClient()
      .from('registro_compras')
      .select('id, estado_oc, area, valor_total, created_at')

    if (scope === 'personal') {
      query = query.eq('creado_por_id', user.id)
    } else {
      if (areaParam && areaParam !== 'todas') query = query.eq('area', areaParam)
    }

    if (yearParam) {
      query = query
        .gte('created_at', `${yearParam}-01-01T00:00:00`)
        .lte('created_at', `${yearParam}-12-31T23:59:59`)
    }

    const { data: ocs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byEstado: Record<string, number> = {}
    const byArea:   Record<string, number> = {}
    const byMes:    Record<string, number> = {}
    const yearsSet: Set<number> = new Set()
    let valorAprobado = 0

    for (const oc of (ocs ?? [])) {
      byEstado[oc.estado_oc] = (byEstado[oc.estado_oc] ?? 0) + 1
      if (oc.area) byArea[oc.area] = (byArea[oc.area] ?? 0) + 1
      const mes = oc.created_at?.slice(0, 7)
      if (mes) {
        byMes[mes] = (byMes[mes] ?? 0) + 1
        yearsSet.add(Number(mes.slice(0, 4)))
      }
      if (oc.estado_oc === 'aprobada') valorAprobado += Number(oc.valor_total) || 0
    }

    // Áreas disponibles para filtro (solo scope global)
    let areas: string[] = []
    if (scope === 'global') {
      const { data: allAreas } = await adminClient()
        .from('registro_compras').select('area')
      areas = [...new Set((allAreas ?? []).map((r: { area: string }) => r.area).filter(Boolean))].sort()
    }

    return NextResponse.json({
      rol,
      scope,
      kpis: {
        total:         ocs?.length ?? 0,
        en_proceso:    byEstado['en_proceso']              ?? 0,
        en_aprobacion: (byEstado['en_aprobacion_compras'] ?? 0) + (byEstado['en_aprobacion_gerencia'] ?? 0),
        aprobadas:     byEstado['aprobada']                ?? 0,
        rechazadas:    byEstado['rechazada']               ?? 0,
        canceladas:    byEstado['cancelada']               ?? 0,
        valor_aprobado: valorAprobado,
      },
      porEstado: Object.entries(byEstado).map(([estado, count]) => ({ estado, count })),
      porArea:   Object.entries(byArea)
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count),
      porMes:    Object.entries(byMes)
        .map(([mes, count]) => ({ mes, count }))
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
