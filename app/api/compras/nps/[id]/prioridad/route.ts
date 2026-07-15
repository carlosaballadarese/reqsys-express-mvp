import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

const PRIORIDADES = ['excepcional', 'alta', 'media', 'baja']

// Spec: HU-009 RN-03 — Estados en los que ya no tiene sentido reclasificar Prioridad
const ESTADOS_PROHIBIDOS = ['rechazada', 'devuelta', 'oc_aprobada', 'completada']

// Spec: HU-009 CA-16
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()

    if (!perfil || !['compras', 'admin'].includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const { prioridad } = await req.json()

    if (!PRIORIDADES.includes(prioridad)) {
      return NextResponse.json({ error: 'Prioridad inválida' }, { status: 400 })
    }

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, numero, prioridad')
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    if (ESTADOS_PROHIBIDOS.includes(np.estado)) {
      return NextResponse.json(
        { error: `No se puede reclasificar Prioridad en estado '${np.estado}'` },
        { status: 400 }
      )
    }

    if (prioridad === np.prioridad) {
      return NextResponse.json({ success: true })
    }

    // Spec CA-16: solo ajusta el plazo objetivo hacia adelante — no toca sla_iniciado_en
    // ni sla_pausado_*, el tiempo ya transcurrido no se recalcula.
    await adminClient()
      .from('notas_pedido')
      .update({ prioridad })
      .eq('id', id)

    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'prioridad_reclasificada',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        `Prioridad reclasificada de '${np.prioridad}' a '${prioridad}'`,
    })

    await registrarAuditoria({
      accion:     'reclasificar_prioridad_np',
      entidad:    'nota_pedido',
      entidad_id: id,
      referencia: np.numero,
      detalle:    { anterior: np.prioridad, nueva: prioridad },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
