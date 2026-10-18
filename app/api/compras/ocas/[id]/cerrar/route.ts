import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { ESTADOS_OCA_NO_TERMINALES } from '@/lib/oca-estado'
import { actualizarEstadoNP } from '@/lib/np-estado'

// Spec: HU-018 RN-02 (extendido), CA-11 — compras, gerencia o admin cierran
const ROLES_CERRAR = ['compras', 'gerencia', 'admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_CERRAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const motivo = (body?.motivo ?? '').trim()
    if (!motivo) return NextResponse.json({ error: 'El motivo de cierre es requerido' }, { status: 400 })

    const { id } = await params
    const { data: oca, error } = await adminClient()
      .from('oca').select('id, estado').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (!ESTADOS_OCA_NO_TERMINALES.includes(oca.estado)) {
      return NextResponse.json({ error: 'Esta OCA no puede cerrarse en su estado actual' }, { status: 409 })
    }

    await adminClient().from('oca').update({ estado: 'cerrada', motivo_cierre: motivo }).eq('id', id)

    await adminClient().from('historial_oca').insert({
      oca_id: id, estado: 'cerrada', actor_email: perfil.email, actor_nombre: perfil.nombre,
      notas: `OCA cerrada. Motivo: ${motivo}`,
    })

    await registrarAuditoria({ accion: 'cerrar_oca', entidad: 'oca', entidad_id: id })

    // Spec: HU-019 CA-07, Decisión de diseño #3 — recalcula TODAS las NPs
    // afectadas (no asume 1 sola NP por OCA), ya que oca_items.item_np_id
    // puede apuntar a líneas de distintas NPs.
    const { data: ocaItems } = await adminClient()
      .from('oca_items').select('item_np_id').eq('oca_id', id).not('item_np_id', 'is', null)
    const itemNpIds = [...new Set((ocaItems ?? []).map((io: any) => io.item_np_id).filter(Boolean))]
    if (itemNpIds.length > 0) {
      const { data: itemsNp } = await adminClient()
        .from('items_np').select('nota_pedido_id').in('id', itemNpIds)
      const npIdsAfectadas = [...new Set((itemsNp ?? []).map((i: any) => i.nota_pedido_id))]
      await Promise.all(npIdsAfectadas.map(npId => actualizarEstadoNP(npId)))
    }

    return NextResponse.json({ estado: 'cerrada' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
