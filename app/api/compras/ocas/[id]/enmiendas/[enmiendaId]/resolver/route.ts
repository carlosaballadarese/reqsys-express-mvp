import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import type { OcaItemInput } from '@/lib/oca-validaciones'

// Spec: HU-020 RN-02 — solo gerencia/admin resuelven enmiendas
const ROLES_RESOLVER = ['gerencia', 'admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; enmiendaId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_RESOLVER.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id, enmiendaId } = await params
    const body = await req.json()
    const decision = body?.decision
    const motivo = (body?.motivo ?? '').trim()

    if (!['aprobar', 'rechazar'].includes(decision)) {
      return NextResponse.json({ error: "decision debe ser 'aprobar' o 'rechazar'" }, { status: 400 })
    }
    if (decision === 'rechazar' && !motivo) {
      return NextResponse.json({ error: 'El motivo de rechazo es requerido' }, { status: 400 })
    }

    const { data: enmienda, error: errorEnmienda } = await adminClient()
      .from('oca_enmiendas').select('*').eq('id', enmiendaId).eq('oca_id', id).single()
    if (errorEnmienda || !enmienda) {
      return NextResponse.json({ error: 'Enmienda no encontrada' }, { status: 404 })
    }
    if (enmienda.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Esta enmienda ya fue resuelta' }, { status: 409 })
    }

    const { data: oca, error: errorOca } = await adminClient()
      .from('oca').select('id, numero_oca, estado, fecha_fin, presupuesto_total').eq('id', id).single()
    if (errorOca || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })

    if (decision === 'rechazar') {
      await adminClient().from('oca_enmiendas').update({
        estado: 'rechazada',
        motivo_rechazo: motivo,
        aprobado_por_id: user.id,
        aprobado_en: new Date().toISOString(),
      }).eq('id', enmiendaId)

      await registrarAuditoria({
        accion: 'rechazar_enmienda_oca', entidad: 'oca_enmienda', entidad_id: enmiendaId, referencia: oca.numero_oca,
      })

      return NextResponse.json({ estado: 'rechazada' })
    }

    // decision === 'aprobar'
    // Spec: HU-020 Decisión de diseño #4 — la reactivación agotada/vencida ->
    // vigente se hace inline aquí, sin reutilizar actualizarEstadoOca() (esa
    // función solo deriva hacia adelante, nunca hacia atrás).
    if (enmienda.tipo === 'incremento_presupuesto') {
      const nuevoPresupuesto = Number(oca.presupuesto_total) + Number(enmienda.monto_adicional)
      await adminClient().from('oca').update({
        presupuesto_total: nuevoPresupuesto,
        ...(oca.estado === 'agotada' ? { estado: 'vigente' } : {}),
      }).eq('id', id)
    } else if (enmienda.tipo === 'extension_plazo') {
      await adminClient().from('oca').update({
        fecha_fin: enmienda.fecha_fin_nueva,
        ...(oca.estado === 'vencida' ? { estado: 'vigente' } : {}),
      }).eq('id', id)
    } else {
      // modificacion_precios — mismo patrón de reemplazo completo que PUT /api/compras/ocas/[id]
      await adminClient().from('oca_items').delete().eq('oca_id', id)
      const items: OcaItemInput[] = enmienda.items_nuevos ?? []
      if (items.length > 0) {
        await adminClient().from('oca_items').insert(
          items.map(it => ({
            oca_id: id,
            codigo: it.codigo,
            descripcion: it.descripcion,
            unidad: it.unidad,
            categoria: it.categoria ?? null,
            precio_unitario: it.precio_unitario ?? null,
            precio_maximo: it.precio_maximo ?? null,
            item_np_id: it.item_np_id ?? null,
          }))
        )
      }
    }

    await adminClient().from('oca_enmiendas').update({
      estado: 'aprobada',
      aprobado_por_id: user.id,
      aprobado_en: new Date().toISOString(),
    }).eq('id', enmiendaId)

    await adminClient().from('historial_oca').insert({
      oca_id: id,
      estado: 'vigente',
      actor_email: perfil.email,
      actor_nombre: perfil.nombre,
      notas: `Enmienda de tipo '${enmienda.tipo}' aprobada`,
    })

    await registrarAuditoria({
      accion: 'aprobar_enmienda_oca', entidad: 'oca_enmienda', entidad_id: enmiendaId, referencia: oca.numero_oca,
    })

    return NextResponse.json({ estado: 'aprobada' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
