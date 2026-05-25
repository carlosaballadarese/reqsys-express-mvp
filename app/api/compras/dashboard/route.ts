import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol, email')
      .eq('id', user.id)
      .single()

    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { rol, email } = perfil
    const areaParam = req.nextUrl.searchParams.get('area')
    const yearParam = req.nextUrl.searchParams.get('year')
    const esGlobal  = ['admin', 'compras', 'gerencia', 'consulta'].includes(rol)

    let query = adminClient()
      .from('notas_pedido')
      .select('id, estado, area, prioridad, tipo_compra, total_estimado, convertida, created_at')

    if (rol === 'solicitante') {
      query = query.eq('solicitante_email', email)
    } else if (rol === 'coordinador') {
      const { data: coords } = await adminClient()
        .from('coordinadores_area').select('area').eq('email', email)
      const areas = coords?.map(c => c.area) ?? []
      if (areas.length === 0) return NextResponse.json(emptyResponse(rol))
      query = query.in('area', areas)
    }

    if (esGlobal && areaParam && areaParam !== 'todas') {
      query = query.eq('area', areaParam)
    }

    if (yearParam) {
      query = query
        .gte('created_at', `${yearParam}-01-01T00:00:00`)
        .lte('created_at', `${yearParam}-12-31T23:59:59`)
    }

    const { data: nps, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Agregación en JS — evita RPC y funciona con cualquier filtro
    const byEstado:    Record<string, number> = {}
    const byArea:      Record<string, { count: number; total: number }> = {}
    const byPrioridad: Record<string, number> = {}
    const byTipo:      Record<string, number> = {}
    const byMes:       Record<string, { count: number; total: number }> = {}
    const yearsSet:    Set<number> = new Set()
    let totalEstimado = 0
    let convertidas   = 0

    for (const np of (nps ?? [])) {
      byEstado[np.estado] = (byEstado[np.estado] ?? 0) + 1
      if (!byArea[np.area]) byArea[np.area] = { count: 0, total: 0 }
      byArea[np.area].count++
      byArea[np.area].total += Number(np.total_estimado) || 0
      byPrioridad[np.prioridad] = (byPrioridad[np.prioridad] ?? 0) + 1
      byTipo[np.tipo_compra]    = (byTipo[np.tipo_compra]    ?? 0) + 1
      const mes = np.created_at?.slice(0, 7)
      if (mes) {
        if (!byMes[mes]) byMes[mes] = { count: 0, total: 0 }
        byMes[mes].count++
        byMes[mes].total += Number(np.total_estimado) || 0
        yearsSet.add(Number(mes.slice(0, 4)))
      }
      totalEstimado += Number(np.total_estimado) || 0
      if (np.convertida) convertidas++
    }

    // Áreas disponibles para filtro (global)
    let areas: string[] = []
    if (esGlobal) {
      const { data: allAreas } = await adminClient()
        .from('notas_pedido').select('area')
      areas = [...new Set(allAreas?.map(r => r.area) ?? [])].sort()
    }

    return NextResponse.json({
      rol,
      scope: rol === 'solicitante' ? 'personal' : rol === 'coordinador' ? 'area' : 'global',
      kpis: {
        total:         nps?.length ?? 0,
        pendientes:    byEstado['pendiente']  ?? 0,
        aprobadas:     byEstado['aprobada']   ?? 0,
        rechazadas:    byEstado['rechazada']  ?? 0,
        devueltas:     byEstado['devuelta']   ?? 0,
        convertidas,
        totalEstimado,
      },
      porEstado:    Object.entries(byEstado).map(([estado, count]) => ({ estado, count })),
      porArea:      Object.entries(byArea)
        .map(([area, d]) => ({ area, count: d.count, total: d.total }))
        .sort((a, b) => b.count - a.count),
      porPrioridad: Object.entries(byPrioridad)
        .map(([prioridad, count]) => ({ prioridad, count }))
        .sort((a, b) => b.count - a.count),
      porTipo:      Object.entries(byTipo)
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count),
      porMes:       Object.entries(byMes)
        .map(([mes, d]) => ({ mes, count: d.count, total: d.total }))
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .slice(-12),
      years:  [...yearsSet].sort((a, b) => b - a),
      areas,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

function emptyResponse(rol: string) {
  return {
    rol, scope: 'area',
    kpis: { total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0, devueltas: 0, convertidas: 0, totalEstimado: 0 },
    porEstado: [], porArea: [], porPrioridad: [], porTipo: [], porMes: [], years: [], areas: [],
  }
}
