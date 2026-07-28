import { NextRequest, NextResponse } from 'next/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { transporter } from '@/lib/mailer'
import { pausarSLAPorCierre } from '@/lib/np-estado'

// Spec: HU-017 CA-01, CA-02, RN-02, RN-05 — Estados desde los que una NP puede
// cancelarse. completada (RN-02) y pendiente/borrador (RN-05) quedan fuera.
const ESTADOS_CANCELABLES = ['aprobada', 'en_gestion', 'oc_directa', 'devuelta', 'rechazada']

// Spec: HU-017 CA-02 — el Solicitante solo puede cancelar antes de que se le
// asigne comprador; desde en_gestion/oc_directa en adelante es exclusivo de Compras/Admin.
const ESTADOS_CANCELABLES_SOLICITANTE = ['aprobada', 'devuelta', 'rechazada']

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

    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const esCompras = ['compras', 'admin'].includes(perfil.rol)

    // Spec CA-09: motivo obligatorio
    let motivo = ''
    try {
      const body = await req.json()
      motivo = (body?.motivo ?? '').trim()
    } catch {
      // body vacío o no JSON
    }
    if (!motivo)
      return NextResponse.json({ error: 'El motivo de cancelación es requerido' }, { status: 400 })

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, numero, area, creado_por_id, solicitante_email, solicitante_nombre')
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Spec CA-02, RN-04: el Solicitante solo puede cancelar sus propias NPs
    if (!esCompras) {
      if (np.creado_por_id !== user.id)
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      if (!ESTADOS_CANCELABLES_SOLICITANTE.includes(np.estado)) {
        if (ESTADOS_CANCELABLES.includes(np.estado)) {
          // Estado cancelable en general (en_gestion/oc_directa) pero ya no para el Solicitante
          return NextResponse.json({
            error: 'Ya no puedes cancelar esta NP porque tiene un comprador asignado; contacta a Compras',
          }, { status: 403 })
        }
        return NextResponse.json({ error: 'Esta NP no puede cancelarse en su estado actual' }, { status: 400 })
      }
    } else if (!ESTADOS_CANCELABLES.includes(np.estado)) {
      return NextResponse.json({ error: 'Esta NP no puede cancelarse en su estado actual' }, { status: 400 })
    }

    // Spec RN-01: bloquear si hay OCs vivas (no rechazada/cancelada) vinculadas
    const { data: itemsNp } = await adminClient()
      .from('items_np')
      .select('id')
      .eq('nota_pedido_id', id)

    const itemNpIds = (itemsNp ?? []).map((i: { id: string }) => i.id)
    if (itemNpIds.length > 0) {
      const { data: itemsOc } = await adminClient()
        .from('items_oc')
        .select('registro_compras_id')
        .in('item_np_id', itemNpIds)

      const ocIdsCandidatos = [...new Set((itemsOc ?? []).map((i: { registro_compras_id: string }) => i.registro_compras_id))]
      if (ocIdsCandidatos.length > 0) {
        const { data: ocsVivas } = await adminClient()
          .from('registro_compras')
          .select('id, numero_oc')
          .in('id', ocIdsCandidatos)
          .neq('estado_oc', 'rechazada')
          .neq('estado_oc', 'cancelada')

        if (ocsVivas && ocsVivas.length > 0) {
          return NextResponse.json({
            error: 'Esta NP tiene Órdenes de Compra activas — cancélalas primero',
            ocs_vivas: ocsVivas,
          }, { status: 400 })
        }
      }
    }

    // Spec CA-04: persiste estado, snapshot del estado previo, motivo y actor
    await adminClient()
      .from('notas_pedido')
      .update({
        estado:                    'cancelada',
        estado_previo_cancelacion: np.estado,
        motivo_cancelacion_np:     motivo,
        cancelado_por_id:          user.id,
        cancelado_en:              new Date().toISOString(),
      })
      .eq('id', id)

    // Spec CA-04: historial visible para todos los roles
    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'cancelada',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        `NP cancelada. Motivo: ${motivo}`,
    })

    // Spec CA-05: pausa el SLA si estaba activo (idempotente, sin efecto si no aplica)
    await pausarSLAPorCierre(id).catch(console.error)

    // Spec CA-10: notificación por email — texto plano, mismo patrón que
    // aprobar/rechazar/devolver NP. Siempre al coordinador del área; y a quien
    // no ejecutó la cancelación (Solicitante si canceló Compras, coordinador de
    // Compras si canceló el propio Solicitante).
    try {
      const { data: coordArea } = await anonClient()
        .from('coordinadores_area')
        .select('nombre, email')
        .eq('area', np.area)
        .single()

      if (coordArea) {
        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: coordArea.email,
          subject: `REQSYS NP Cancelada ${np.numero} - ${np.area}`,
          text: [
            `Estimado/a ${coordArea.nombre},`,
            '',
            `La Nota de Pedido ${np.numero} del area ${np.area} fue cancelada por ${perfil.nombre}.`,
            `Motivo: ${motivo}`,
            '',
            `Ingrese al sistema REQSYS para ver el detalle.`,
            '',
            'REQSYS - ARLIFT S.A.',
          ].join('\n'),
        })
      }

      if (esCompras && np.creado_por_id !== user.id && np.solicitante_email) {
        await transporter.sendMail({
          from: 'One ARLIFT <one.arlift@arlift.com.ec>',
          to: np.solicitante_email,
          subject: `REQSYS NP ${np.numero} cancelada`,
          text: [
            `Estimado/a ${np.solicitante_nombre},`,
            '',
            `Su Nota de Pedido ${np.numero} fue cancelada por Compras.`,
            `Motivo: ${motivo}`,
            '',
            `Ingrese al sistema REQSYS para ver el detalle.`,
            '',
            'REQSYS - ARLIFT S.A.',
          ].join('\n'),
        })
      } else if (!esCompras) {
        const { data: compras } = await anonClient()
          .from('coordinadores_area')
          .select('nombre, email')
          .eq('area', 'Compras')
          .single()

        if (compras) {
          await transporter.sendMail({
            from: 'One ARLIFT <one.arlift@arlift.com.ec>',
            to: compras.email,
            subject: `REQSYS NP Cancelada ${np.numero} - ${np.area}`,
            text: [
              `Estimado/a ${compras.nombre},`,
              '',
              `La Nota de Pedido ${np.numero} del area ${np.area} fue cancelada por el solicitante ${perfil.nombre}.`,
              `Motivo: ${motivo}`,
              '',
              `Ingrese al sistema REQSYS para ver el detalle.`,
              '',
              'REQSYS - ARLIFT S.A.',
            ].join('\n'),
          })
        }
      }
    } catch (mailErr) {
      // Spec: la cancelación ya quedó firme — el email es informativo, no bloquea
      console.error('Error al notificar cancelación de NP:', mailErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
