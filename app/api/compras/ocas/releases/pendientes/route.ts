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

    let resultado = releases ?? []

    if (!ROLES_PRIVILEGIADOS.includes(perfil.rol)) {
      // Scope por coordinador: solo los releases cuyo aprobador_asignado_id
      // resuelva a una fila de coordinadores_area con el email de esta sesión.
      const { data: misCoordinaciones } = await adminClient()
        .from('coordinadores_area').select('id').eq('email', perfil.email).eq('activo', true)
      const idsPermitidos = new Set((misCoordinaciones ?? []).map((c: { id: string }) => c.id))

      resultado = resultado.filter((r: { aprobador_asignado_id: string | null }) =>
        r.aprobador_asignado_id !== null && idsPermitidos.has(r.aprobador_asignado_id)
      )
    }

    // Enriquecimiento para la bandeja (CA-05) — nombres en vez de solo ids.
    const ocaIds = [...new Set(resultado.map((r: { oca_id: string }) => r.oca_id))]
    const areaIds = [...new Set(resultado.map((r: { area_id: string }) => r.area_id))]
    const solicitanteIds = [...new Set(resultado.map((r: { solicitante_id: string }) => r.solicitante_id))]

    const [{ data: ocas }, { data: areas }, { data: solicitantes }] = await Promise.all([
      ocaIds.length > 0 ? adminClient().from('oca').select('id, numero_oca').in('id', ocaIds) : Promise.resolve({ data: [] }),
      areaIds.length > 0 ? adminClient().from('areas').select('id, nombre').in('id', areaIds) : Promise.resolve({ data: [] }),
      solicitanteIds.length > 0 ? adminClient().from('perfiles').select('id, nombre').in('id', solicitanteIds) : Promise.resolve({ data: [] }),
    ])
    const numeroOcaPorId: Record<string, string> = {}
    for (const o of ocas ?? []) numeroOcaPorId[o.id] = o.numero_oca
    const nombreAreaPorId: Record<string, string> = {}
    for (const a of areas ?? []) nombreAreaPorId[a.id] = a.nombre
    const nombreSolicitantePorId: Record<string, string> = {}
    for (const s of solicitantes ?? []) nombreSolicitantePorId[s.id] = s.nombre

    const enriquecido = resultado.map((r: { oca_id: string; area_id: string; solicitante_id: string }) => ({
      ...r,
      numero_oca: numeroOcaPorId[r.oca_id] ?? null,
      area_nombre: nombreAreaPorId[r.area_id] ?? null,
      solicitante_nombre: nombreSolicitantePorId[r.solicitante_id] ?? null,
    }))

    return NextResponse.json(enriquecido)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
