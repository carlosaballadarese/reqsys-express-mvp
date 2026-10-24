import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { actualizarEstadoOca } from '@/lib/oca-estado'
import { esAutorizadoParaResolverRelease } from '@/lib/oca-release-autorizacion'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id, releaseId } = await params
    const body = await req.json()
    const motivo = (body?.motivo ?? '').trim()
    if (!motivo) return NextResponse.json({ error: 'El motivo de anulación es requerido' }, { status: 400 })

    const { data: release, error: errorRelease } = await adminClient()
      .from('oca_releases').select('*').eq('id', releaseId).eq('oca_id', id).single()
    if (errorRelease || !release) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 })
    }
    // Spec: CA-08 — solo se anula un release ya aprobado
    if (release.estado !== 'aprobado') {
      return NextResponse.json({ error: 'Solo se puede anular un release aprobado' }, { status: 409 })
    }

    // Spec: RN-02 — misma autorización que resolver
    const autorizado = await esAutorizadoParaResolverRelease(perfil.rol, perfil.email, release.aprobador_asignado_id)
    if (!autorizado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    await adminClient().from('oca_releases').update({
      estado: 'anulado',
      motivo_anulacion: motivo,
      anulado_por_id: user.id,
      anulado_en: new Date().toISOString(),
    }).eq('id', releaseId)

    // Spec: RN-09 — calcularPresupuestoConsumido() ya excluye 'anulado' (solo
    // suma 'aprobado'), así que el presupuesto se restituye automáticamente;
    // esto puede derivar agotada->vigente por primera vez con datos reales.
    await actualizarEstadoOca(id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'vigente', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: `Release ${release.numero_release} anulado. Motivo: ${motivo}`,
    })

    await registrarAuditoria({ accion: 'anular_release_oca', entidad: 'oca_release', entidad_id: releaseId, referencia: release.numero_release })

    return NextResponse.json({ estado: 'anulado' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
