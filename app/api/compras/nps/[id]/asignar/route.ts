import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'
import { actualizarEstadoNP, ESTADOS_NP_ABIERTA_A_OC } from '@/lib/np-estado'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  let body: { accion?: string; asistente_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const { accion, asistente_id } = body

  if (!['asignar', 'reasignar', 'tomar_control'].includes(accion ?? ''))
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

  if ((accion === 'asignar' || accion === 'reasignar') && !asistente_id)
    return NextResponse.json({ error: 'asistente_id requerido' }, { status: 400 })

  // Verificar NP
  const { data: np, error: npErr } = await adminClient()
    .from('notas_pedido')
    .select('id, numero, estado, convertida, area, solicitante_nombre, asignado_a, prioridad')
    .eq('id', id)
    .single()

  if (npErr || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

  // Spec: HU-010 — corrección del guard bloqueante (hallazgo Fase 1). El guard viejo
  // (estado !== 'aprobada') bloqueaba reasignar/tomar_control apenas la NP salía de
  // 'aprobada' por HU-009, que ocurre automáticamente en la primera asignación.
  if (!ESTADOS_NP_ABIERTA_A_OC.includes(np.estado as typeof ESTADOS_NP_ABIERTA_A_OC[number]))
    return NextResponse.json({ error: 'La NP no está en un Estado que permita gestionar su comprador' }, { status: 400 })

  if (np.convertida)
    return NextResponse.json({ error: 'La NP ya fue convertida a OC' }, { status: 400 })

  // Spec: HU-010 CA-01, CA-09 — asignar requiere que no haya comprador; reasignar/
  // tomar_control requieren que sí lo haya.
  if (accion === 'asignar' && np.asignado_a)
    return NextResponse.json({ error: 'La NP ya tiene comprador asignado, usa reasignar' }, { status: 400 })
  if ((accion === 'reasignar' || accion === 'tomar_control') && !np.asignado_a)
    return NextResponse.json({ error: 'La NP no tiene comprador asignado' }, { status: 400 })

  // Para asignar/reasignar: verificar que el asistente_id existe y tiene el rol correcto
  // Spec: HU-010 CA-02, CA-03 — comprador puede ser asistente_compras o compras
  let asistente: { id: string; nombre: string; email: string } | null = null
  if (accion !== 'tomar_control') {
    const { data: ast } = await adminClient()
      .from('perfiles')
      .select('id, nombre, email')
      .eq('id', asistente_id)
      .in('rol', ['asistente_compras', 'compras'])
      .eq('activo', true)
      .single()

    if (!ast) return NextResponse.json({ error: 'Asistente no encontrado o inactivo' }, { status: 404 })
    asistente = ast
  }

  // Actualizar asignación
  const updateData = accion === 'tomar_control'
    ? { asignado_a: null, asignado_en: null, asignado_nombre: null, asignado_email: null }
    : {
        asignado_a:      asistente!.id,
        asignado_en:     new Date().toISOString(),
        asignado_nombre: asistente!.nombre,
        asignado_email:  asistente!.email,
      }

  await adminClient().from('notas_pedido').update(updateData).eq('id', id)

  // Registrar en historial
  const tipoEvento: Record<string, string> = {
    asignar:       'asignacion',
    reasignar:     'reasignacion',
    tomar_control: 'toma_control',
  }

  // Corrección de bug preexistente (no relacionado a HU-010, detectado por el nuevo
  // test de tomar_control): el objeto literal anterior evaluaba las 3 claves de forma
  // eager, incluidas asignar/reasignar (que dereferencian asistente!.nombre) aunque
  // asistente sea null en tomar_control — crasheaba con 500 en todo intento de
  // "Quitar asignación", desde la creación de este endpoint.
  const notaEvento = accion === 'tomar_control'
    ? `Control tomado por ${perfil.nombre} (Compras)`
    : accion === 'reasignar'
      ? `Reasignada a ${asistente!.nombre} (${asistente!.email})`
      : `Asignada a ${asistente!.nombre} (${asistente!.email})`

  await adminClient().from('historial_np').insert({
    np_id:        id,
    estado:       tipoEvento[accion!],
    actor_email:  perfil.email,
    actor_nombre: perfil.nombre,
    notas:        notaEvento,
  })

  // Spec: HU-010 RN-01 — las 3 acciones invocan actualizarEstadoNP() al final.
  // Primera asignación: transiciona a en_gestion/oc_directa y fija sla_iniciado_en.
  // Reasignar/tomar_control: no-op para el Estado y el SLA (RN-04/CA-09 de HU-010).
  await actualizarEstadoNP(id).catch(console.error)

  // Spec: HU-010 CA-04 — al asignar (no en reasignar/tomar_control), la Acción
  // "Asignada" (orden 1) se marca automáticamente en todas las líneas de la NP.
  // No aplica si Prioridad=Excepcional (Estado destino oc_directa — RN-05 de HU-009,
  // esa NP no usa Acciones). Idempotente: si ya estaba marcada, sobreescribe el mismo valor.
  if (accion === 'asignar' && np.prioridad !== 'excepcional') {
    const { data: accionAsignada } = await adminClient()
      .from('acciones_gestion')
      .select('id')
      .eq('orden', 1)
      .single()

    if (accionAsignada) {
      await adminClient()
        .from('items_np')
        .update({
          accion_id:         accionAsignada.id,
          accion_marcada_en: new Date().toISOString(),
          accion_marcada_por: asistente!.id,
        })
        .eq('nota_pedido_id', id)
    }
  }

  // Email al asistente en asignar/reasignar
  if (accion !== 'tomar_control' && asistente) {
    try {
      await transporter.sendMail({
        from:    'One ARLIFT <one.arlift@arlift.com.ec>',
        to:      asistente.email,
        subject: `REQSYS — NP ${np.numero} asignada a ti`,
        text: [
          `Hola ${asistente.nombre},`,
          '',
          `La Nota de Pedido ${np.numero} (${np.area}) ha sido asignada a ti por ${perfil.nombre}.`,
          '',
          `Ingresa al sistema REQSYS para gestionarla y convertirla en Orden de Compra.`,
          '',
          'REQSYS — ARLIFT S.A.',
        ].join('\n'),
      })
    } catch { /* email informativo, no bloquea */ }
  }

  return NextResponse.json({ ok: true })
}
