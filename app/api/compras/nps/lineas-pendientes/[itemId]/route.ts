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
      .select('id, nota_pedido_id')
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

    // Spec: sdd-design.md, decisión 4 — guard de condición de carrera: si otra
    // persona ya generó la OC de esta línea mientras la vista estaba abierta
    // (HU-014 coexiste con esta vista), se rechaza la edición.
    const { data: itemsOc } = await adminClient()
      .from('items_oc')
      .select('registro_compras_id')
      .eq('item_np_id', itemId)

    const ocIds = [...new Set((itemsOc ?? []).map((io: any) => io.registro_compras_id))]
    if (ocIds.length > 0) {
      const { data: ocs } = await adminClient()
        .from('registro_compras')
        .select('estado_oc')
        .in('id', ocIds)

      const tieneOcViva = (ocs ?? []).some((oc: any) => ESTADOS_OC_VIVOS.includes(oc.estado_oc))
      if (tieneOcViva) {
        return NextResponse.json({ error: 'linea_ya_no_pendiente' }, { status: 409 })
      }
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
