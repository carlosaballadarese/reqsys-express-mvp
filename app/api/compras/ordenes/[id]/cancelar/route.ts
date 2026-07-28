import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularCoberturaNP } from '@/lib/np-cobertura'
import { actualizarEstadoNP } from '@/lib/np-estado'

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

    // Leer OC (ya no se lee nota_pedido_id: HU-016 lo deja NULL en OCs consolidadas —
    // las NPs involucradas se derivan de items_oc.item_np_id, sea 1 o varias)
    const { data: oc } = await adminClient()
      .from('registro_compras')
      .select('id, numero_oc, estado_oc')
      .eq('id', id)
      .single()

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (oc.estado_oc === 'cancelada')
      return NextResponse.json({ error: 'La OC ya está cancelada' }, { status: 409 })

    const estadoAnterior = oc.estado_oc

    // ── PASO 1: cancelar la OC (acción crítica, siempre firme una vez ejecutada) ──
    const { error: errCancel } = await adminClient()
      .from('registro_compras')
      .update({ estado_oc: 'cancelada', motivo_cancelacion: motivo.trim() })
      .eq('id', id)

    if (errCancel) {
      console.error('Error al cancelar OC:', errCancel)
      return NextResponse.json({ error: 'Error al cancelar la OC' }, { status: 500 })
    }

    // Spec: HU-016 CA-12 — NPs involucradas = las que tienen items_oc.item_np_id en
    // esta OC (reemplaza el antiguo oc.nota_pedido_id único).
    const { data: itemsOC } = await adminClient()
      .from('items_oc')
      .select('item_np_id, cantidad, descripcion')
      .eq('registro_compras_id', id)

    const itemsVinculados = (itemsOC ?? []).filter(
      (i: { item_np_id: string | null }) => i.item_np_id
    )
    const npIds = [...new Set(itemsVinculados.map(i => i.item_np_id as string))]

    let np_revertida = false
    const npsConError: string[] = []

    if (npIds.length > 0) {
      const { data: itemsNpRows } = await adminClient()
        .from('items_np')
        .select('id, nota_pedido_id')
        .in('id', npIds)

      const npIdPorItemNp: Record<string, string> = {}
      for (const it of (itemsNpRows ?? [])) npIdPorItemNp[it.id] = it.nota_pedido_id

      const npIdsReales = [...new Set(Object.values(npIdPorItemNp))]

      // Spec: decisión del usuario (2026-07-27) — best-effort por NP. La cancelación de
      // la OC (PASO 1) ya quedó firme; si el historial/reversión de UNA NP falla, se
      // registra el error y se continúa con las demás, en vez de revertir la
      // cancelación completa (que dejaría huérfano el historial ya insertado de otras
      // NPs ya procesadas en este mismo loop — no hay forma de deshacerlo de forma
      // atómica cuando N puede ser > 1). Mismo criterio "no bloqueante" que
      // autoCompletarNP/actualizarEstadoNP en convertir/[id] y PUT ordenes/[id].
      for (const npId of npIdsReales) {
        try {
          const itemsDeEstaNP = itemsVinculados.filter(i => npIdPorItemNp[i.item_np_id as string] === npId)
          const detalleUnidades = itemsDeEstaNP.length > 0
            ? itemsDeEstaNP.map(i => `${i.descripcion.slice(0, 40)}: ${Number(i.cantidad)} un.`).join(' | ')
            : 'Sin ítems vinculados a líneas de NP'

          const notasHistorial =
            `OC ${oc.numero_oc} cancelada. Unidades liberadas: ${detalleUnidades}. ` +
            `Motivo: ${motivo.trim()}`

          const { data: np } = await adminClient()
            .from('notas_pedido')
            .select('estado, numero')
            .eq('id', npId)
            .single()

          const { error: errHist } = await adminClient()
            .from('historial_np')
            .insert({
              np_id:        npId,
              estado:       'oc_cancelada',
              actor_nombre: perfil.nombre,
              actor_email:  perfil.email,
              notas:        notasHistorial,
            })
          if (errHist) throw errHist

          // Revertir NP a 'aprobada' si estaba completada y la cobertura ya no alcanza 100%
          if (np?.estado === 'completada') {
            const cobertura = await calcularCoberturaNP(npId)

            if (!cobertura.np_cubierta) {
              const { error: errRevert } = await adminClient()
                .from('notas_pedido')
                .update({ estado: 'aprobada' })
                .eq('id', npId)
              if (errRevert) throw errRevert

              const { error: errHistRev } = await adminClient()
                .from('historial_np')
                .insert({
                  np_id:        npId,
                  estado:       'reabierta',
                  actor_nombre: perfil.nombre,
                  actor_email:  perfil.email,
                  notas: `NP revertida a Aprobada automáticamente. Cobertura: ${cobertura.porcentaje_global.toFixed(0)}% tras cancelación de ${oc.numero_oc}.`,
                })
              if (errHistRev) throw errHistRev

              np_revertida = true
            }
          }

          // Spec: HU-009 CA-19, RN-02+RN-04 (Tarea 21) — recalcula el Estado de la NP
          // (excluyendo ya la OC cancelada); no-op si la NP quedó en 'completada'.
          await actualizarEstadoNP(npId).catch(console.error)
        } catch (errNp) {
          console.error(`Error al procesar impacto en NP ${npId} tras cancelar OC ${oc.numero_oc}:`, errNp)
          npsConError.push(npId)
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
        detalle:    { estado_anterior: estadoAnterior, motivo: motivo.trim(), np_revertida, nps_con_error: npsConError },
      })
    } catch (e) { console.error(e) }

    // Spec: la OC queda cancelada de todas formas (best-effort); nps_con_error permite
    // a Compras/Admin saber si el impacto en alguna NP necesita revisión manual.
    return NextResponse.json({ success: true, np_revertida, nps_con_error: npsConError })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
