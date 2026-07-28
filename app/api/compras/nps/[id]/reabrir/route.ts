import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actualizarEstadoNP, ESTADOS_AUTOGESTIONADOS } from '@/lib/np-estado'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', user.id)
      .single()

    // Spec: solo compras y admin pueden reabrir NPs
    if (!perfil || !['compras', 'admin'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, numero, estado_previo_cancelacion')
      .eq('id', id)
      .single()

    // Spec: HU-017 — se puede reabrir desde completada (comportamiento original) o
    // desde cancelada (nuevo, CA-07)
    if (!np || !['completada', 'cancelada'].includes(np.estado))
      return NextResponse.json({ error: 'NP no encontrada o no está en un estado reabrible' }, { status: 404 })

    let notasHistorial: string
    let estadoAnteriorDetalle: string
    let estadoNuevoDetalle: string

    if (np.estado === 'completada') {
      // Spec CA-11 (HU-006): limpiar flag y motivo de completado manual al reabrir
      await adminClient()
        .from('notas_pedido')
        .update({ estado: 'aprobada', completado_manualmente: false, motivo_completado: null })
        .eq('id', id)

      // Spec: HU-009 CA-19 (Tarea 23) — no asumir 'aprobada' a ciegas: recalcula el
      // Estado real según OCs vivas ya vinculadas y reactiva el SLA si corresponde.
      await actualizarEstadoNP(id).catch(console.error)

      notasHistorial = 'NP reabierta — estado anterior: completada'
      estadoAnteriorDetalle = 'completada'
      estadoNuevoDetalle = 'aprobada'
    } else {
      // Spec: HU-017 CA-07 — reabrir una NP cancelada vuelve al Estado exacto previo.
      const destino = np.estado_previo_cancelacion ?? 'aprobada'
      const limpiezaCancelacion = {
        estado_previo_cancelacion: null,
        motivo_cancelacion_np:     null,
        cancelado_por_id:          null,
        cancelado_en:              null,
      }

      if (ESTADOS_AUTOGESTIONADOS.includes(destino as never)) {
        // Mismo truco que completada→aprobada: resetea a 'aprobada' y deja que
        // actualizarEstadoNP() redescubra el Estado real (asignación/cobertura
        // vigente) reactivando el SLA como efecto colateral de la transición.
        await adminClient()
          .from('notas_pedido')
          .update({ estado: 'aprobada', ...limpiezaCancelacion })
          .eq('id', id)
        await actualizarEstadoNP(id).catch(console.error)
      } else {
        // devuelta/rechazada — actualizarEstadoNP() no actúa sobre estos Estados
        // (no autogestionados); no había SLA activo, se restaura directo.
        await adminClient()
          .from('notas_pedido')
          .update({ estado: destino, ...limpiezaCancelacion })
          .eq('id', id)
      }

      notasHistorial = `NP reabierta — estado anterior: cancelada (vuelve a ${destino})`
      estadoAnteriorDetalle = 'cancelada'
      estadoNuevoDetalle = destino
    }

    // Spec: registrar en historial de la NP
    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'reabierta',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        notasHistorial,
    })

    await registrarAuditoria({
      accion:     'reabrir_np',
      entidad:    'nota_pedido',
      entidad_id: id,
      referencia: np.numero,
      detalle:    { estado_anterior: estadoAnteriorDetalle, estado_nuevo: estadoNuevoDetalle },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
