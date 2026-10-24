import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-021 CA-05 — bandeja transversal a todas las OCAs, scopeada a lo
// que el usuario en sesión puede resolver (mismo criterio de autorización
// que esAutorizadoParaResolverRelease, aplicado como filtro de listado en
// vez de guard de un solo registro).
const ROLES_PRIVILEGIADOS = ['compras', 'admin']

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, email').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const ocaId = searchParams.get('oca_id')
    const usuarioId = searchParams.get('usuario_id')
    const areaId = searchParams.get('area_id')

    let query = adminClient()
      .from('oca_releases').select('*').eq('estado', 'pendiente_aprobacion').order('created_at', { ascending: true })
    if (ocaId) query = query.eq('oca_id', ocaId)
    if (usuarioId) query = query.eq('solicitante_id', usuarioId)
    if (areaId) query = query.eq('area_id', areaId)

    const { data: releases, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (ROLES_PRIVILEGIADOS.includes(perfil.rol)) {
      return NextResponse.json(releases ?? [])
    }

    // Scope por coordinador: solo los releases cuyo aprobador_asignado_id
    // resuelva a una fila de coordinadores_area con el email de esta sesión.
    const { data: misCoordinaciones } = await adminClient()
      .from('coordinadores_area').select('id').eq('email', perfil.email).eq('activo', true)
    const idsPermitidos = new Set((misCoordinaciones ?? []).map((c: { id: string }) => c.id))

    const scoped = (releases ?? []).filter((r: { aprobador_asignado_id: string | null }) =>
      r.aprobador_asignado_id !== null && idsPermitidos.has(r.aprobador_asignado_id)
    )
    return NextResponse.json(scoped)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
