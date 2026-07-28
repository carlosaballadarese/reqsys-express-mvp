import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { autoCompletarNP, calcularCoberturaNP } from '@/lib/np-cobertura'
import { actualizarEstadoNP } from '@/lib/np-estado'
import { agruparItemsPorNP, validarYVerificarPorNP, npsAfectadasPorEdicion, type ItemConNP } from '@/lib/np-multi-oc'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: oc, error } = await adminClient()
    .from('registro_compras')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

  const { data: items } = await adminClient()
    .from('items_oc')
    .select('*')
    .eq('registro_compras_id', id)
    .order('linea')

  // Spec: HU-016 Decisión 3 — OC consolidada (nota_pedido_id NULL, items con item_np_id)
  // no tiene una única NP de origen que mostrar; se resuelve la lista real de NPs
  // enlazadas vía items_np, para que la UI reemplace el link singular por una lista.
  let nps_origen: { id: string; numero: string }[] | undefined
  if (!oc.nota_pedido_id) {
    const itemNpIds = [...new Set(
      (items ?? []).map((i: { item_np_id: string | null }) => i.item_np_id).filter(Boolean)
    )] as string[]

    if (itemNpIds.length > 0) {
      const { data: itemsNp } = await adminClient()
        .from('items_np')
        .select('nota_pedido_id')
        .in('id', itemNpIds)

      const npIds = [...new Set(
        (itemsNp ?? []).map((i: { nota_pedido_id: string }) => i.nota_pedido_id)
      )]

      if (npIds.length > 0) {
        const { data: nps } = await adminClient()
          .from('notas_pedido')
          .select('id, numero')
          .in('id', npIds)
        nps_origen = nps ?? []
      }
    }
  }

  return NextResponse.json({ oc, items: items ?? [], ...(nps_origen ? { nps_origen } : {}) })
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
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: ocEstado } = await adminClient()
      .from('registro_compras').select('estado_oc, creado_por_id, nota_pedido_id').eq('id', id).single()
    if (ocEstado && ocEstado.estado_oc !== 'en_proceso')
      return NextResponse.json({ error: 'Solo se pueden editar OCs en estado En Proceso' }, { status: 409 })

    if (perfil.rol === 'asistente_compras') {
      if (!ocEstado || ocEstado.creado_por_id !== user.id)
        return NextResponse.json({ error: 'Solo puedes editar OCs que tú generaste' }, { status: 403 })
    }

    const body = await req.json()

    const {
      proveedor_id, fecha_oc, descripcion_oc,
      area, tipo_compra, centro_costo,
      numero_factura, fecha_factura,
      valor_total, valor_retenido,
      tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago,
      numero_cotizacion, condiciones_minimas,
      items,
      sobrecompra_confirmada,
    } = body

    if (!proveedor_id) {
      return NextResponse.json({ error: 'Debe seleccionar un proveedor registrado' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })
    }

    // Actualizar snapshot del proveedor al editar
    const { data: prov } = await adminClient()
      .from('proveedores')
      .select('nombre, ruc, direccion, telefono, email, contacto')
      .eq('id', proveedor_id)
      .single()

    if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })

    // Spec: HU-016 — una OC está "enlazada a NP" si el registro ya tenía nota_pedido_id
    // (single-NP, HU-003/HU-014) O si alguna línea entrante trae item_np_id (consolidada,
    // HU-016 — nota_pedido_id queda NULL a propósito, Decisión 1 de sdd-design.md).
    // registro_compras.nota_pedido_id solo ya no alcanza para decidir si se valida
    // trazabilidad — se combina con la señal de los ítems para no romper HU-003 CA-08
    // (OC libre, sin NP origen, sigue sin validar) ni CA-02 (OC single-NP sigue exigiendo
    // item_np_id en todas sus líneas).
    const nota_pedido_id = ocEstado?.nota_pedido_id ?? null
    const npLinked = Boolean(nota_pedido_id)
      || (items as { item_np_id?: string | null }[]).some(item => item.item_np_id)

    let grupos: Map<string, ItemConNP[]> = new Map()

    if (npLinked) {
      // CA-02: toda línea de OC enlazada a NP debe tener item_np_id
      const sinEnlace = items
        .map((item: { item_np_id?: string | null }, idx: number) => ({ item, linea: idx + 1 }))
        .filter(({ item }: { item: { item_np_id?: string | null } }) => !item.item_np_id)
        .map(({ linea }: { linea: number }) => linea)
      if (sinEnlace.length > 0)
        return NextResponse.json({ error: 'item_sin_enlace_np', lineas: sinEnlace }, { status: 400 })

      // Agrupa cada línea por la NP real de su item_np_id (soporta múltiples NPs, CA-13)
      grupos = await agruparItemsPorNP(items as ItemConNP[])
      const totalAgrupado = [...grupos.values()].reduce((s, arr) => s + arr.length, 0)
      if (totalAgrupado !== items.length) {
        const idsValidos = new Set([...grupos.values()].flat().map(i => i.item_np_id))
        const lineas = (items as { item_np_id?: string }[])
          .map((item, idx) => ({ item, linea: idx + 1 }))
          .filter(({ item }) => item.item_np_id && !idsValidos.has(item.item_np_id))
          .map(({ linea }) => linea)
        return NextResponse.json({ error: 'item_no_pertenece_a_np', lineas }, { status: 400 })
      }

      // CA-03 (justificación) + sobrecompra, evaluados por NP — excluye los ítems
      // actuales de esta misma OC del acumulado (excluirOcId) para no contar doble.
      const validacion = await validarYVerificarPorNP(grupos, {
        excluirOcId: id,
        sobrecompraConfirmada: sobrecompra_confirmada,
      })
      if (validacion.erroresJustificacion.length > 0)
        return NextResponse.json({ error: 'justificacion_requerida', errores: validacion.erroresJustificacion }, { status: 400 })
      if (validacion.itemsExcedidos.length > 0) {
        return NextResponse.json({
          error:           'sobrecompra',
          message:         'La cantidad ingresada supera el saldo disponible en una o más NPs. ¿Desea continuar con esta sobrecompra?',
          items_excedidos: validacion.itemsExcedidos,
        }, { status: 409 })
      }
    }

    // CA-13/RN-04: NPs a recalcular = unión de las referenciadas antes y después de
    // editar — se calcula ANTES del delete/insert (necesita leer los items_oc actuales).
    const npsAfectadas = npLinked
      ? await npsAfectadasPorEdicion(id, items as ItemConNP[])
      : new Set<string>()

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    const { error: errorOC } = await adminClient()
      .from('registro_compras')
      .update({
        proveedor_id,
        proveedor:           prov.nombre,
        proveedor_ruc:       prov.ruc       || null,
        proveedor_direccion: prov.direccion || null,
        proveedor_telefono:  prov.telefono  || null,
        proveedor_contacto:  prov.contacto  || null,
        proveedor_email:     prov.email     || null,
        numero_cotizacion:   numero_cotizacion   || null,
        condiciones_minimas: condiciones_minimas || null,
        fecha_oc:            fecha_oc            || null,
        descripcion_oc:      descripcion_oc    || null,
        area:                area              || null,
        tipo_compra:         tipo_compra       || null,
        centro_costo:        centro_costo      || null,
        numero_factura:      numero_factura    || null,
        fecha_factura:       fecha_factura     || null,
        valor_total:         valorTotal,
        valor_retenido:      valorRetenido,
        valor_a_pagar:       valorTotal - valorRetenido,
        banco:               banco             || null,
        tipo_pago:           tipo_pago         || null,
        mes_pago:            mes_pago          || null,
        dias_credito:        Number(dias_credito) || 0,
        fecha_vencimiento:   fecha_vencimiento || null,
      })
      .eq('id', id)

    if (errorOC) return NextResponse.json({ error: errorOC.message }, { status: 500 })

    await adminClient().from('items_oc').delete().eq('registro_compras_id', id)

    const itemsOC = items.map((item: {
      item_np_id?: string | null
      codigo: string; descripcion: string; unidad: string
      cantidad: number; precio_unitario: number
      tipo?: string; informacion_adicional?: string; fecha_entrega?: string
      justificacion_cantidad?: string | null
    }, index: number) => ({
      registro_compras_id:    id,
      linea:                  index + 1,
      item_np_id:             item.item_np_id || null,
      codigo:                 item.codigo || null,
      descripcion:            item.descripcion,
      unidad:                 item.unidad,
      cantidad:               item.cantidad,
      precio_unitario:        item.precio_unitario || 0,
      tipo:                   item.tipo || null,
      informacion_adicional:  item.informacion_adicional || null,
      fecha_entrega:          item.fecha_entrega || null,
      justificacion_cantidad: item.justificacion_cantidad?.trim() || null,
    }))

    const { error: errorItems } = await adminClient().from('items_oc').insert(itemsOC)
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 })

    const { data: ocActual } = await adminClient()
      .from('registro_compras')
      .select('numero_oc')
      .eq('id', id)
      .single()

    // Spec: HU-016 CA-13/RN-04 — auto-completar cobertura + recalcular Estado por cada
    // NP en la unión antes/después (npsAfectadas), incluida una NP que quedó sin líneas
    // en esta edición (debe recalcularse igual que si la OC se hubiera cancelado para
    // ella — no puede quedar "congelada" reflejando una cobertura que ya no existe).
    if (npsAfectadas.size > 0) {
      const { data: npsRows } = await adminClient()
        .from('notas_pedido')
        .select('id, estado')
        .in('id', [...npsAfectadas])

      const estadoPorNp = new Map(
        (npsRows ?? []).map((np: { id: string; estado: string }) => [np.id, np.estado])
      )

      for (const npId of npsAfectadas) {
        const estadoActual = estadoPorNp.get(npId) ?? ''

        // RN-04: si la edición le hizo perder cobertura a una NP ya completada (ej. se
        // le quitaron todas sus líneas de esta OC), revertirla a 'aprobada' — mismo
        // criterio que la reversión ya existente en cancelar/route.ts. autoCompletarNP
        // es unidireccional (aprobada→completada) y actualizarEstadoNP no toca NPs en
        // 'completada' (estado terminal, HU-009) — sin este bloque la NP queda
        // "congelada" en completada aunque ya no tenga cobertura real.
        if (estadoActual === 'completada') {
          const cobertura = await calcularCoberturaNP(npId)
          if (!cobertura.np_cubierta) {
            await adminClient().from('notas_pedido').update({ estado: 'aprobada' }).eq('id', npId)
            const { error: errHistRevert } = await adminClient().from('historial_np').insert({
              np_id:        npId,
              estado:       'reabierta',
              actor_nombre: perfil.nombre,
              actor_email:  perfil.email,
              notas: `NP revertida a Aprobada automáticamente. Cobertura: ${cobertura.porcentaje_global.toFixed(0)}% tras editar OC ${ocActual?.numero_oc ?? id}.`,
            })
            if (errHistRevert) console.error(errHistRevert)
          }
        } else {
          await autoCompletarNP(npId, estadoActual).catch(console.error)
        }

        // Spec: HU-009 CA-19 (Tarea 19), extendido a multi-NP por HU-016
        await actualizarEstadoNP(npId).catch(console.error)
      }
    }

    await registrarAuditoria({
      accion:     'editar_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: ocActual?.numero_oc ?? id,
      detalle:    { proveedor: prov.nombre, area, tipo_compra, valor_total: valorTotal },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
