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
      .select('id, estado, area, prioridad, tipo_compra, convertida, created_at')

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
    const byArea:      Record<string, number> = {}
    const byPrioridad: Record<string, number> = {}
    const byTipo:      Record<string, number> = {}
    const byMes:       Record<string, number> = {}
    const yearsSet:    Set<number> = new Set()
    let convertidas = 0

    for (const np of (nps ?? [])) {
      byEstado[np.estado]    = (byEstado[np.estado]    ?? 0) + 1
      byArea[np.area]        = (byArea[np.area]        ?? 0) + 1
      byPrioridad[np.prioridad] = (byPrioridad[np.prioridad] ?? 0) + 1
      byTipo[np.tipo_compra] = (byTipo[np.tipo_compra] ?? 0) + 1
      const mes = np.created_at?.slice(0, 7)
      if (mes) {
        byMes[mes] = (byMes[mes] ?? 0) + 1
        yearsSet.add(Number(mes.slice(0, 4)))
      }
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
        total:      nps?.length ?? 0,
        pendientes: byEstado['pendiente'] ?? 0,
        aprobadas:  byEstado['aprobada']  ?? 0,
        rechazadas: byEstado['rechazada'] ?? 0,
        devueltas:  byEstado['devuelta']  ?? 0,
        convertidas,
      },
      porEstado:    Object.entries(byEstado).map(([estado, count]) => ({ estado, count })),
      porArea:      Object.entries(byArea)
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count),
      porPrioridad: Object.entries(byPrioridad)
        .map(([prioridad, count]) => ({ prioridad, count }))
        .sort((a, b) => b.count - a.count),
      porTipo:      Object.entries(byTipo)
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count),
      porMes:       Object.entries(byMes)
        .map(([mes, count]) => ({ mes, count }))
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
    kpis: { total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0, devueltas: 0, convertidas: 0 },
    porEstado: [], porArea: [], porPrioridad: [], porTipo: [], porMes: [], years: [], areas: [],
  }
}
