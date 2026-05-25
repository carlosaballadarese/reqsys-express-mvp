import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'

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
    .select('id, numero, estado, convertida, area, solicitante_nombre')
    .eq('id', id)
    .single()

  if (npErr || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

  if (np.estado !== 'aprobada')
    return NextResponse.json({ error: 'Solo se pueden asignar NPs aprobadas' }, { status: 400 })

  if (np.convertida)
    return NextResponse.json({ error: 'La NP ya fue convertida a OC' }, { status: 400 })

  // Para asignar/reasignar: verificar que el asistente_id existe y tiene el rol correcto
  let asistente: { id: string; nombre: string; email: string } | null = null
  if (accion !== 'tomar_control') {
    const { data: ast } = await adminClient()
      .from('perfiles')
      .select('id, nombre, email')
      .eq('id', asistente_id)
      .eq('rol', 'asistente_compras')
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

  const notasEvento: Record<string, string> = {
    asignar:       `Asignada a ${asistente!.nombre} (${asistente!.email})`,
    reasignar:     `Reasignada a ${asistente!.nombre} (${asistente!.email})`,
    tomar_control: `Control tomado por ${perfil.nombre} (Compras)`,
  }

  await adminClient().from('historial_np').insert({
    np_id:        id,
    estado:       tipoEvento[accion!],
    actor_email:  perfil.email,
    actor_nombre: perfil.nombre,
    notas:        notasEvento[accion!],
  })

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
