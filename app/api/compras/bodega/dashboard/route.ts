import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_BODEGA, parsearFiltrosReporte } from '@/lib/bodega-reportes-query'
import { obtenerResumenDashboardBodega } from '@/lib/bodega-dashboard-query'

// Spec: HU-038 CA-05 — mismos roles que los reportes de HU-035
// (ROLES_REPORTES_BODEGA), sin scope personal — los 5 roles ven el mismo dashboard.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_BODEGA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosReporte(req.nextUrl.searchParams)
    const resumen = await obtenerResumenDashboardBodega(filtros)

    return NextResponse.json(resumen)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
