import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_OCA, parsearFiltrosReporte } from '@/lib/oca-reportes-query'
import { obtenerResumenDashboard } from '@/lib/oca-dashboard-query'

// Spec: HU-025 CA-09/RN-01 — mismos roles que los reportes de HU-023, sin
// scope personal para asistente_compras (los 4 roles ven el mismo dashboard).
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_OCA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosReporte(req.nextUrl.searchParams)
    const resumen = await obtenerResumenDashboard(filtros)

    return NextResponse.json(resumen)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
