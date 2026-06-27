import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ROLES_PERMITIDOS = ['compras', 'admin', 'gerencia', 'asistente_compras']

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

    const { rol } = perfil
    const scope     = rol === 'asistente_compras' ? 'personal' : 'global'
    const areaParam = req.nextUrl.searchParams.get('area')
    const yearParam = req.nextUrl.searchParams.get('year')

    // Spec CA-07: OCs canceladas con campos necesarios para la tabla del dashboard
    let query = adminClient()
      .from('registro_compras')
      .select('id, numero_oc, numero_np, nota_pedido_id, area, proveedor, created_at, valor_a_pagar, motivo_cancelacion')
      .eq('estado_oc', 'cancelada')
      .order('created_at', { ascending: false })

    // Spec CA-07: scope personal para asistente_compras
    if (scope === 'personal') {
      query = query.eq('creado_por_id', user.id)
    } else {
      // Spec CA-08: filtro área solo en scope global
      if (areaParam && areaParam !== 'todas') query = query.eq('area', areaParam)
    }

    // Spec CA-08: filtro año aplica a ambos scopes
    if (yearParam) {
      query = query
        .gte('created_at', `${yearParam}-01-01T00:00:00`)
        .lte('created_at', `${yearParam}-12-31T23:59:59`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
