import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_LINEAS_PENDIENTES, ESTADOS_LINEAS_PENDIENTES } from '@/lib/np-lineas-pendientes-query'
import { ESTADOS_OC_VIVOS } from '@/lib/np-estado'

// Spec: HU-013 CA-04 — edición inline de proveedor_sugerido con persistencia inmediata.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()

    if (!perfil || !ROLES_LINEAS_PENDIENTES.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { itemId } = await params
    const body = await req.json()
    const proveedor_sugerido: string | null = body?.proveedor_sugerido ?? null

    const { data: item } = await adminClient()
      .from('items_np')
      .select('id, nota_pedido_id, cantidad')
      .eq('id', itemId)
      .single()

    if (!item) {
      return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })
    }

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado')
      .eq('id', item.nota_pedido_id)
      .single()

    // Spec: HU-013 CA-01 — solo tiene sentido editar mientras la línea sigue en el
    // subconjunto de Estados con líneas potencialmente pendientes.
    if (!np || !ESTADOS_LINEAS_PENDIENTES.includes(np.estado)) {
      return NextResponse.json({ error: 'linea_ya_no_pendiente' }, { status: 409 })
    }

    // Spec: SC-012 — guard de condición de carrera por SALDO, no por presencia de
    // cualquier OC viva: si otra persona ya generó una OC que cubre el saldo
    // completo de esta línea mientras la vista estaba abierta (HU-014 coexiste
    // con esta vista), se rechaza la edición; si queda saldo disponible, se permite.
    const { data: itemsOc } = await adminClient()
      .from('items_oc')
      .select('registro_compras_id, cantidad')
      .eq('item_np_id', itemId)

    const ocIds = [...new Set((itemsOc ?? []).map((io: any) => io.registro_compras_id))]
    let comprometido = 0
    if (ocIds.length > 0) {
      const { data: ocs } = await adminClient()
        .from('registro_compras')
        .select('id, estado_oc')
        .in('id', ocIds)

      // Emparejado explícito por registro_compras_id — nunca por índice: una
      // línea puede tener varias filas de items_oc repartidas entre varias OCs.
      const estadoPorOcId = new Map((ocs ?? []).map((oc: any) => [oc.id, oc.estado_oc]))
      comprometido = (itemsOc ?? [])
        .filter((io: any) => ESTADOS_OC_VIVOS.includes(estadoPorOcId.get(io.registro_compras_id) ?? ''))
        .reduce((sum: number, io: any) => sum + Number(io.cantidad), 0)
    }

    const saldo = Math.max(0, Number(item.cantidad) - comprometido)
    if (saldo <= 0) {
      return NextResponse.json({ error: 'linea_ya_no_pendiente' }, { status: 409 })
    }

    await adminClient()
      .from('items_np')
      .update({ proveedor_sugerido })
      .eq('id', itemId)

    return NextResponse.json({ item: { id: itemId, proveedor_sugerido } })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
