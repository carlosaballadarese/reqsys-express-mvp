import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { autoCompletarNP } from '@/lib/np-cobertura'
import { actualizarEstadoNP, ESTADOS_NP_ABIERTA_A_OC, type Estado } from '@/lib/np-estado'
import { agruparItemsPorNP, validarYVerificarPorNP, type ItemConNP } from '@/lib/np-multi-oc'

// Spec: HU-016 CA-01 a CA-08 — creación de una OC cuyas líneas (items_oc) referencian
// ítems (item_np_id) de NPs distintas. Equivalente multi-NP de convertir/[id], que sigue
// intacto como el camino de 1 sola NP (Decisión 4, sdd-design.md — no se extiende
// convertir/[id], su firma toma el id de NP de la URL).
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const {
      proveedor_id, fecha_oc, descripcion_oc,
      numero_factura, fecha_factura,
      valor_total, valor_retenido,
      tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago,
      numero_cotizacion,
      items,
      sobrecompra_confirmada,
    } = body

    if (!proveedor_id)
      return NextResponse.json({ error: 'Debe seleccionar un proveedor registrado' }, { status: 400 })
    if (!items || items.length === 0)
      return NextResponse.json({ error: 'La OC debe tener al menos un ítem' }, { status: 400 })

    // Spec: HU-016 CA-04/RN-01 — a diferencia de convertir/[id] (que permite líneas sin
    // item_np_id, HU-003 CA-08), este endpoint solo se invoca desde la Vista de Líneas
    // Pendientes: toda línea consolidada proviene de un ítem de NP conocido.
    const sinEnlace = (items as { item_np_id?: string }[])
      .map((item, idx) => ({ item, linea: idx + 1 }))
      .filter(({ item }) => !item.item_np_id)
      .map(({ linea }) => linea)
    if (sinEnlace.length > 0)
      return NextResponse.json({ error: 'item_sin_enlace_np', lineas: sinEnlace }, { status: 400 })

    // Agrupa cada línea por la NP real de su item_np_id (1 sola query)
    const grupos = await agruparItemsPorNP(items as ItemConNP[])
    const totalAgrupado = [...grupos.values()].reduce((s, arr) => s + arr.length, 0)
    if (totalAgrupado !== items.length) {
      // Spec: generaliza el guard item_no_pertenece_a_np de HU-014 CA-08 — aquí no hay
      // una única NP "dueña" del request; el caso posible es un item_np_id inexistente.
      const idsValidos = new Set([...grupos.values()].flat().map(i => i.item_np_id))
      const lineas = (items as { item_np_id?: string }[])
        .map((item, idx) => ({ item, linea: idx + 1 }))
        .filter(({ item }) => item.item_np_id && !idsValidos.has(item.item_np_id))
        .map(({ linea }) => linea)
      return NextResponse.json({ error: 'item_no_pertenece_a_np', lineas }, { status: 400 })
    }

    const npIds = [...grupos.keys()]

    const { data: npsInfo } = await adminClient()
      .from('notas_pedido')
      .select('id, numero, asignado_a, estado, convertida')
      .in('id', npIds)

    const npsMap = new Map((npsInfo ?? []).map((np: {
      id: string; numero: string; asignado_a: string | null; estado: Estado; convertida: boolean
    }) => [np.id, np]))

    // CA-01: cada NP referenciada debe estar en un Estado que permita generar OC
    const npsNoElegibles = npIds.filter(id => {
      const np = npsMap.get(id)
      return !np || !ESTADOS_NP_ABIERTA_A_OC.includes(np.estado)
    })
    if (npsNoElegibles.length > 0)
      return NextResponse.json({ error: 'items_de_np_no_elegible', np_ids: npsNoElegibles }, { status: 400 })

    // Spec: asistente_compras solo puede consolidar NPs asignadas a él — evaluado por
    // CADA NP referenciada (a diferencia de convertir/[id], que evalúa una sola vez).
    if (perfil.rol === 'asistente_compras') {
      const npsAjenas = npIds.filter(id => npsMap.get(id)?.asignado_a !== user.id)
      if (npsAjenas.length > 0)
        return NextResponse.json({ error: 'Solo puedes consolidar NPs asignadas a ti', np_ids: npsAjenas }, { status: 403 })
    }

    // CA-08/HU-003 CA-03 (justificación) + verificación de sobrecompra, por NP
    const validacion = await validarYVerificarPorNP(grupos, { sobrecompraConfirmada: sobrecompra_confirmada })
    if (validacion.erroresJustificacion.length > 0)
      return NextResponse.json({ error: 'justificacion_requerida', errores: validacion.erroresJustificacion }, { status: 400 })
    if (validacion.itemsExcedidos.length > 0) {
      return NextResponse.json({
        error:           'sobrecompra',
        message:         'La cantidad ingresada supera el saldo disponible en una o más NPs. ¿Desea continuar con esta sobrecompra?',
        items_excedidos: validacion.itemsExcedidos,
      }, { status: 409 })
    }

    // Snapshot del proveedor
    const { data: prov } = await adminClient()
      .from('proveedores')
      .select('nombre, ruc, direccion, telefono, email, contacto')
      .eq('id', proveedor_id)
      .single()

    if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })

    const year = new Date().getFullYear()
    const { data: seqData, error: seqError } = await adminClient().rpc('siguiente_numero_oc', { p_year: year })
    if (seqError || seqData === null)
      return NextResponse.json({ error: 'Error al generar número de OC' }, { status: 500 })
    const numero_oc = `OC-${year}-${String(seqData).padStart(4, '0')}`

    const valorTotal    = Number(valor_total)    || 0
    const valorRetenido = Number(valor_retenido) || 0

    // Decisión 2 (sdd-design.md): numero_np es snapshot de solo lectura — lista de
    // números de NP unidos por coma, ya no "el número de la NP".
    const numerosNP = npIds.map(id => npsMap.get(id)?.numero).filter(Boolean).join(', ')

    const { data: oc, error: errorOC } = await adminClient()
      .from('registro_compras')
      .insert({
        nota_pedido_id:      null, // Decisión 1: sin NP "principal" arbitraria
        proveedor_id,
        proveedor:           prov.nombre,
        proveedor_ruc:       prov.ruc       || null,
        proveedor_direccion: prov.direccion || null,
        proveedor_telefono:  prov.telefono  || null,
        proveedor_contacto:  prov.contacto  || null,
        proveedor_email:     prov.email     || null,
        numero_cotizacion:   numero_cotizacion || null,
        numero_np:           numerosNP || null,
        fecha_oc:            fecha_oc          || null,
        numero_oc,
        // area/tipo_compra/centro_costo: sin fuente única entre varias NPs — se dejan
        // sin definir, editables luego vía PUT (CA-13), igual que en cualquier otra OC.
        descripcion_oc:      descripcion_oc || `Consolidación de ${npIds.length} NPs: ${numerosNP}`,
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
        estado_oc:           'en_proceso',
        creado_por_id:       user.id,
        creado_por_nombre:   perfil.nombre,
      })
      .select()
      .single()

    if (errorOC || !oc) {
      console.error(errorOC)
      return NextResponse.json({ error: 'Error al crear la OC' }, { status: 500 })
    }

    const itemsOC = (items as {
      item_np_id: string
      codigo?: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
      tipo?: string
      informacion_adicional?: string
      fecha_entrega?: string
      justificacion_cantidad?: string
    }[]).map((item, index) => ({
      registro_compras_id:    oc.id,
      linea:                  index + 1,
      item_np_id:             item.item_np_id,
      codigo:                 item.codigo     || null,
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
    if (errorItems) {
      console.error(errorItems)
      return NextResponse.json({ error: 'Error al guardar ítems de la OC' }, { status: 500 })
    }

    // CA-06: autoCompletarNP + actualizarEstadoNP una vez por cada NP distinta
    for (const npId of npIds) {
      const np = npsMap.get(npId)
      await autoCompletarNP(npId, np?.estado ?? '').catch(console.error)
      await actualizarEstadoNP(npId).catch(console.error)

      if (np && !np.convertida) {
        await adminClient().from('notas_pedido').update({ convertida: true }).eq('id', npId)
      }

      await adminClient().from('historial_np').insert({
        np_id:        npId,
        estado:       'convertida',
        actor_email:  perfil.email,
        actor_nombre: perfil.nombre,
        notas:        `OC consolidada generada: ${numero_oc} — Proveedor: ${prov.nombre} — NPs incluidas: ${numerosNP}`,
      })
    }

    await registrarAuditoria({
      accion:     'consolidar_np_a_oc',
      entidad:    'orden_compra',
      entidad_id: oc.id,
      referencia: numero_oc,
      detalle:    { numeros_np: numerosNP, proveedor: prov.nombre, items_count: items.length, nps_count: npIds.length },
    })

    return NextResponse.json({ success: true, oc_id: oc.id, numero_oc })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
