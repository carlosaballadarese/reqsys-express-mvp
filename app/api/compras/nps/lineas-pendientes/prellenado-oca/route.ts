import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_LINEAS_PENDIENTES, ESTADOS_LINEAS_PENDIENTES } from '@/lib/np-lineas-pendientes-query'
import { ESTADOS_OC_VIVOS } from '@/lib/np-estado'
import { ESTADOS_OCA_VIVAS } from '@/lib/oca-estado'

// Spec: HU-019 CA-01, CA-02 — prellenado de datos para crear una OCA desde
// líneas de UNA sola NP, seleccionadas en Líneas Pendientes de OC. El
// matching de proveedor (coincidencia exacta contra proveedores.nombre) se
// hace en el cliente, mismo patrón ya usado por ModalGenerarOC (HU-014 CA-07)
// — este endpoint solo devuelve proveedor_sugerido por ítem, sin resolverlo.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_LINEAS_PENDIENTES.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const itemIds = (req.nextUrl.searchParams.get('items') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'Debe especificar al menos un ítem' }, { status: 400 })
    }

    const { data: items } = await adminClient()
      .from('items_np')
      .select('id, nota_pedido_id, codigo, descripcion, unidad, precio_unitario, proveedor_sugerido')
      .in('id', itemIds)

    if (!items || items.length !== itemIds.length) {
      return NextResponse.json({ error: 'Una o más líneas no fueron encontradas' }, { status: 404 })
    }

    const npIds = [...new Set(items.map(i => i.nota_pedido_id))]
    if (npIds.length > 1) {
      return NextResponse.json({ error: 'Todas las líneas deben pertenecer a la misma NP' }, { status: 400 })
    }

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, numero, estado, asignado_a')
      .eq('id', npIds[0])
      .single()

    if (!np || !ESTADOS_LINEAS_PENDIENTES.includes(np.estado)) {
      return NextResponse.json({ error: 'np_ya_no_elegible' }, { status: 409 })
    }

    // Spec: mismo guard que convertir/[id] — asistente_compras solo sobre NPs asignadas a él.
    if (perfil.rol === 'asistente_compras' && np.asignado_a !== user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Spec: guard de condición de carrera — igual criterio que PATCH .../[itemId],
    // ahora considerando también cobertura por OCA (HU-019 RN-01).
    const { data: itemsOc } = await adminClient()
      .from('items_oc').select('item_np_id, registro_compras_id').in('item_np_id', itemIds)
    const ocIds = [...new Set((itemsOc ?? []).map((io: any) => io.registro_compras_id))]
    const { data: ocs } = ocIds.length > 0
      ? await adminClient().from('registro_compras').select('id, estado_oc').in('id', ocIds)
      : { data: [] as { id: string; estado_oc: string }[] }
    const ocEstadoPorId = new Map((ocs ?? []).map((oc: any) => [oc.id, oc.estado_oc]))
    const algunaLineaConOcViva = (itemsOc ?? []).some(
      (io: any) => ESTADOS_OC_VIVOS.includes(ocEstadoPorId.get(io.registro_compras_id) ?? '')
    )

    const { data: ocaItems } = await adminClient()
      .from('oca_items').select('item_np_id, oca_id').in('item_np_id', itemIds).not('item_np_id', 'is', null)
    const ocaIds = [...new Set((ocaItems ?? []).map((io: any) => io.oca_id))]
    const { data: ocas } = ocaIds.length > 0
      ? await adminClient().from('oca').select('id, estado').in('id', ocaIds)
      : { data: [] as { id: string; estado: string }[] }
    const ocaEstadoPorId = new Map((ocas ?? []).map((oca: any) => [oca.id, oca.estado]))
    const algunaLineaConOcaViva = (ocaItems ?? []).some(
      (io: any) => (ESTADOS_OCA_VIVAS as string[]).includes(ocaEstadoPorId.get(io.oca_id) ?? '')
    )

    if (algunaLineaConOcViva || algunaLineaConOcaViva) {
      return NextResponse.json({ error: 'linea_ya_no_pendiente' }, { status: 409 })
    }

    return NextResponse.json({
      np_id: np.id,
      np_numero: np.numero,
      items: items.map(i => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidad: i.unidad,
        precio_unitario: i.precio_unitario,
        proveedor_sugerido: i.proveedor_sugerido,
        item_np_id: i.id,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
