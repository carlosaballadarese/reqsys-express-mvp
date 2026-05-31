import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularCoberturaNP } from '@/lib/np-cobertura'

export async function POST(
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

    if (!perfil || !['compras', 'admin'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params
    const { motivo } = await req.json()

    if (!motivo?.trim())
      return NextResponse.json({ error: 'El motivo de cancelación es requerido' }, { status: 400 })

    // Leer OC con items vinculados a NP
    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('id, numero_oc, estado_oc, nota_pedido_id')
      .eq('id', id)
      .single()

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (oc.estado_oc === 'cancelada')
      return NextResponse.json({ error: 'La OC ya está cancelada' }, { status: 409 })

    const estadoAnterior = oc.estado_oc

    // ── PASO 1: cancelar la OC ────────────────────────────────────────────────
    const { error: errCancel } = await adminClient()
      .from('registro_compras')
      .update({ estado_oc: 'cancelada', motivo_cancelacion: motivo.trim() })
      .eq('id', id)

    if (errCancel) {
      console.error('Error al cancelar OC:', errCancel)
      return NextResponse.json({ error: 'Error al cancelar la OC' }, { status: 500 })
    }

    let np_revertida = false

    // ── PASO 2: impacto en NP (solo si hay nota_pedido_id) ───────────────────
    if (oc.nota_pedido_id) {
      // Obtener ítems de esta OC con trazabilidad a NP
      const { data: itemsOC } = await adminClient()
        .from('items_oc')
        .select('item_np_id, cantidad, descripcion')
        .eq('registro_compras_id', id)

      const itemsVinculados = (itemsOC ?? []).filter(i => i.item_np_id)

      // Construir texto de impacto
      const detalleUnidades = itemsVinculados.length > 0
        ? itemsVinculados.map(i =>
            `${i.descripcion.slice(0, 40)}: ${Number(i.cantidad)} un.`
          ).join(' | ')
        : 'Sin ítems vinculados a líneas de NP'

      const notasHistorial =
        `OC ${oc.numero_oc} cancelada. Unidades liberadas: ${detalleUnidades}. ` +
        `Motivo: ${motivo.trim()}`

      // Obtener estado actual de la NP
      const { data: np } = await adminClient()
        .from('notas_pedido')
        .select('estado, numero')
        .eq('id', oc.nota_pedido_id)
        .single()

      // ── PASO 2a: registrar en historial_np ───────────────────────────────
      const { error: errHist } = await adminClient()
        .from('historial_np')
        .insert({
          np_id:        oc.nota_pedido_id,
          estado:       'oc_cancelada',
          actor_nombre: perfil.nombre,
          actor_email:  perfil.email,
          notas:        notasHistorial,
        })

      if (errHist) {
        console.error('Error al insertar historial_np — revirtiendo cancelación:', errHist)
        await adminClient()
          .from('registro_compras')
          .update({ estado_oc: estadoAnterior, motivo_cancelacion: null })
          .eq('id', id)
        return NextResponse.json({ error: 'Error al registrar historial de NP. Cancelación revertida.' }, { status: 500 })
      }

      // ── PASO 2b: revertir NP a 'aprobada' si estaba completada ──────────
      if (np?.estado === 'completada') {
        const cobertura = await calcularCoberturaNP(oc.nota_pedido_id)

        if (!cobertura.np_cubierta) {
          const { error: errRevert } = await adminClient()
            .from('notas_pedido')
            .update({ estado: 'aprobada' })
            .eq('id', oc.nota_pedido_id)

          if (errRevert) {
            console.error('Error al revertir NP — revirtiendo cancelación:', errRevert)
            await adminClient()
              .from('registro_compras')
              .update({ estado_oc: estadoAnterior, motivo_cancelacion: null })
              .eq('id', id)
            return NextResponse.json({ error: 'Error al revertir NP. Cancelación revertida.' }, { status: 500 })
          }

          // Historial de reversión de NP
          const { error: errHistRev } = await adminClient()
            .from('historial_np')
            .insert({
              np_id:        oc.nota_pedido_id,
              estado:       'reabierta',
              actor_nombre: perfil.nombre,
              actor_email:  perfil.email,
              notas: `NP revertida a Aprobada automáticamente. Cobertura: ${cobertura.porcentaje_global.toFixed(0)}% tras cancelación de ${oc.numero_oc}.`,
            })

          if (errHistRev) {
            console.error('Error al insertar historial de reversión — revirtiendo cancelación:', errHistRev)
            await adminClient().from('notas_pedido').update({ estado: 'completada' }).eq('id', oc.nota_pedido_id)
            await adminClient()
              .from('registro_compras')
              .update({ estado_oc: estadoAnterior, motivo_cancelacion: null })
              .eq('id', id)
            return NextResponse.json({ error: 'Error al registrar reversión de NP. Cancelación revertida.' }, { status: 500 })
          }

          np_revertida = true
        }
      }
    }

    // ── Auditoría (no crítica — no revierte) ─────────────────────────────────
    try {
      await registrarAuditoria({
        accion:     'cancelar_oc',
        entidad:    'orden_compra',
        entidad_id: id,
        referencia: oc.numero_oc,
        detalle:    { estado_anterior: estadoAnterior, motivo: motivo.trim(), np_revertida },
      })
    } catch (e) { console.error(e) }

    return NextResponse.json({ success: true, np_revertida })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
