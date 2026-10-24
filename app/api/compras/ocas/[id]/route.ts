import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { actualizarEstadoOca, calcularPresupuestoConsumido } from '@/lib/oca-estado'
import { validarCabeceraEItems, type OcaItemInput } from '@/lib/oca-validaciones'
import { actualizarEstadoNP } from '@/lib/np-estado'

// Spec: HU-018 CA-13 — detalle visible para los mismos roles del listado (CA-12)
const ROLES_VER = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']
// Spec: HU-018 RN-01 — solo compras/admin editan (y solo en borrador)
const ROLES_EDITAR = ['compras', 'admin']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_VER.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: ocaInicial, error } = await adminClient()
      .from('oca').select('*').eq('id', id).single()
    if (error || !ocaInicial) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })

    // Spec: HU-018 CA-08/CA-09 — derivación en caliente antes de responder
    if (ocaInicial.estado === 'vigente') {
      await actualizarEstadoOca(id)
    }
    const { data: oca } = await adminClient().from('oca').select('*').eq('id', id).single()

    const { data: items } = await adminClient()
      .from('oca_items').select('*').eq('oca_id', id).order('created_at')

    const { data: areasHab } = await adminClient()
      .from('oca_areas_habilitadas').select('area_id').eq('oca_id', id)
    const areaIds = (areasHab ?? []).map((a: { area_id: string }) => a.area_id)
    const { data: areas } = areaIds.length > 0
      ? await adminClient().from('areas').select('id, nombre').in('id', areaIds)
      : { data: [] as { id: string; nombre: string }[] }

    const { data: historial } = await adminClient()
      .from('historial_oca').select('*').eq('oca_id', id).order('created_at', { ascending: false })

    // Spec: HU-021 CA-10 — calcularPresupuestoConsumido() ya no es un placeholder
    const consumido = await calcularPresupuestoConsumido(id)
    const total = Number(oca?.presupuesto_total ?? 0)
    const disponible = total - consumido
    const porcentaje_ejecucion = total > 0 ? Math.round((consumido / total) * 100) : 0

    return NextResponse.json({
      oca: { ...oca, consumido, disponible, porcentaje_ejecucion },
      items: items ?? [],
      areas_habilitadas: areas ?? [],
      historial: historial ?? [],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_EDITAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: oca, error } = await adminClient()
      .from('oca').select('id, estado').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })
    if (oca.estado !== 'borrador') {
      return NextResponse.json({ error: 'Solo se puede editar una OCA en borrador' }, { status: 409 })
    }

    const body = await req.json()
    const errorValidacion = validarCabeceraEItems(body)
    if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 })

    await adminClient().from('oca').update({
      proveedor_id: body.proveedor_id,
      tipo: body.tipo,
      descripcion: body.descripcion,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      presupuesto_total: body.presupuesto_total,
      referencia_contractual: body.referencia_contractual,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    // Spec: HU-019 CA-06/CA-07 — ítems "antes" de reemplazar (para recalcular
    // también las NPs que pierden su vínculo en esta edición, mismo criterio
    // que npsAfectadasPorEdicion de lib/np-multi-oc.ts para OC).
    const { data: itemsAntes } = await adminClient()
      .from('oca_items').select('item_np_id').eq('oca_id', id).not('item_np_id', 'is', null)
    const itemNpIdsAntes = (itemsAntes ?? []).map((i: any) => i.item_np_id).filter(Boolean)

    // Spec: HU-018 Decisión de diseño #3 — reemplazo completo de items/áreas
    // (delete+insert), mismo patrón que PUT /api/compras/ordenes/[id]
    await adminClient().from('oca_items').delete().eq('oca_id', id)
    const items: OcaItemInput[] = body.items ?? []
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
          // Spec: HU-019 RN-05 — preserva el vínculo a la línea de NP si el
          // ítem entrante lo trae; un ítem removido en la edición simplemente
          // no vuelve a insertarse (el delete de arriba ya lo eliminó), así
          // que su vínculo se pierde sin código adicional.
          item_np_id: it.item_np_id ?? null,
        }))
      )
    }

    await adminClient().from('oca_areas_habilitadas').delete().eq('oca_id', id)
    const areasHabilitadas: string[] = body.areas_habilitadas ?? []
    if (areasHabilitadas.length > 0) {
      await adminClient().from('oca_areas_habilitadas').insert(
        areasHabilitadas.map(area_id => ({ oca_id: id, area_id }))
      )
    }

    await adminClient().from('historial_oca').insert({
      oca_id: id,
      estado: 'borrador',
      actor_email: user.email,
      actor_nombre: perfil.rol,
      notas: 'OCA editada',
    })

    await registrarAuditoria({ accion: 'editar_oca', entidad: 'oca', entidad_id: id })

    // Spec: HU-019 CA-06/CA-07, RN-05 — recalcula la unión de NPs afectadas
    // antes+después de la edición (una NP que pierde su línea en esta OCA
    // debe poder revertir su Estado igual que al cerrar la OCA).
    const itemNpIdsDespues = items.map(it => it.item_np_id).filter(Boolean) as string[]
    const itemNpIdsUnion = [...new Set([...itemNpIdsAntes, ...itemNpIdsDespues])]
    if (itemNpIdsUnion.length > 0) {
      const { data: itemsNpAfectados } = await adminClient()
        .from('items_np').select('nota_pedido_id').in('id', itemNpIdsUnion)
      const npIdsAfectadas = [...new Set((itemsNpAfectados ?? []).map((i: any) => i.nota_pedido_id))]
      await Promise.all(npIdsAfectadas.map(npId => actualizarEstadoNP(npId)))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
