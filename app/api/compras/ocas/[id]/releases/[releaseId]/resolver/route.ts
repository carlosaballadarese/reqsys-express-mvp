import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { actualizarEstadoOca, calcularPresupuestoConsumido } from '@/lib/oca-estado'
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
    const decision = body?.decision
    const motivo = (body?.motivo ?? '').trim()

    if (!['aprobar', 'rechazar'].includes(decision)) {
      return NextResponse.json({ error: "decision debe ser 'aprobar' o 'rechazar'" }, { status: 400 })
    }
    if (decision === 'rechazar' && !motivo) {
      return NextResponse.json({ error: 'El motivo de rechazo es requerido' }, { status: 400 })
    }

    const { data: release, error: errorRelease } = await adminClient()
      .from('oca_releases').select('*').eq('id', releaseId).eq('oca_id', id).single()
    if (errorRelease || !release) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 })
    }
    if (release.estado !== 'pendiente_aprobacion') {
      return NextResponse.json({ error: 'Este release ya fue resuelto' }, { status: 409 })
    }

    // Spec: RN-02 — coordinador del área resuelto, o compras/admin
    const autorizado = await esAutorizadoParaResolverRelease(perfil.rol, perfil.email, release.aprobador_asignado_id)
    if (!autorizado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (decision === 'rechazar') {
      await adminClient().from('oca_releases').update({
        estado: 'rechazado',
        motivo_rechazo: motivo,
        resuelto_por_id: user.id,
        resuelto_en: new Date().toISOString(),
      }).eq('id', releaseId)

      await adminClient().from('historial_oca').insert({
        oca_id: id, estado: 'vigente', actor_email: perfil.email, actor_nombre: perfil.nombre,
        notas: `Release ${release.numero_release} rechazado. Motivo: ${motivo}`,
      })

      await registrarAuditoria({ accion: 'rechazar_release_oca', entidad: 'oca_release', entidad_id: releaseId, referencia: release.numero_release })

      return NextResponse.json({ estado: 'rechazado' })
    }

    // decision === 'aprobar'
    // Spec: RN-04 — revalida presupuesto en caliente, modelo optimista. No se
    // reserva presupuesto por pendientes; el chequeo real ocurre aquí.
    const { data: oca } = await adminClient().from('oca').select('presupuesto_total').eq('id', id).single()
    const consumido = await calcularPresupuestoConsumido(id)
    const disponible = Number(oca?.presupuesto_total ?? 0) - consumido

    if (disponible < Number(release.monto_total)) {
      return NextResponse.json({
        error: 'Presupuesto insuficiente para aprobar este release',
        disponible, monto_total: release.monto_total,
      }, { status: 409 })
    }

    await adminClient().from('oca_releases').update({
      estado: 'aprobado',
      resuelto_por_id: user.id,
      resuelto_en: new Date().toISOString(),
    }).eq('id', releaseId)

    // Spec: CA-10 — primera vez que esto puede derivar vigente->agotada con datos reales
    await actualizarEstadoOca(id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'vigente', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: `Release ${release.numero_release} aprobado por ${release.monto_total}`,
    })

    await registrarAuditoria({ accion: 'aprobar_release_oca', entidad: 'oca_release', entidad_id: releaseId, referencia: release.numero_release })

    return NextResponse.json({ estado: 'aprobado' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
