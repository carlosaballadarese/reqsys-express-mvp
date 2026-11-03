import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'
import { registrarAuditoria } from '@/lib/auditoria'
import { escapeHtml } from '@/lib/utils'

const COOLDOWN_MINUTOS = 5
const MENSAJE_GENERICO = 'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación en breve.'

// Spec: SC-006 RN-07 — evita que un mismo email dispare múltiples envíos en poco tiempo
async function dentroDeCooldown(email: string): Promise<boolean> {
  const desde = new Date(Date.now() - COOLDOWN_MINUTOS * 60 * 1000).toISOString()
  const { data } = await adminClient()
    .from('auditoria')
    .select('id')
    .eq('accion', 'solicitud_recuperacion')
    .eq('referencia', email)
    .gte('created_at', desde)
    .limit(1)
  return !!data && data.length > 0
}

async function registrarEvento(email: string, exito: boolean, detalle?: string): Promise<void> {
  await registrarAuditoria({
    accion:     exito ? 'solicitud_recuperacion' : 'solicitud_recuperacion_fallida',
    entidad:    'usuario',
    referencia: email,
    ...(detalle ? { detalle: { motivo: detalle } } : {}),
  })
}

export async function POST(req: NextRequest) {
  let body: { email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()

  // Spec: SC-006 CA-01 — formato inválido es el único caso que no responde con el mensaje genérico
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 })
  }

  // Spec: SC-006 RN-07 — dentro del cooldown, responde genérico sin tocar Supabase ni loguear de nuevo
  if (await dentroDeCooldown(email)) {
    return NextResponse.json({ mensaje: MENSAJE_GENERICO })
  }

  // Spec: SC-006 Decisión 1 — sin pre-chequeo propio de existencia, generateLink() ya resuelve eso
  const baseUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectTo = `${baseUrl}/recuperar/confirmar`

  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  // Spec: SC-006 RN-01 — email no existente es un caso normal, no se loguea (evita enumeración de cuentas)
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ mensaje: MENSAJE_GENERICO })
  }

  const actionLink = data.properties.action_link
  const nombre      = escapeHtml(email)

  try {
    await transporter.sendMail({
      from:    'REQSYS ARLIFT <reqsys.cabe@gmail.com>',
      to:      email,
      subject: 'REQSYS — Recupera tu contraseña',
      text:
        `Hola,\n\n` +
        `Recibimos una solicitud para recuperar la contraseña de tu cuenta REQSYS (${email}).\n\n` +
        `Ingresa al siguiente enlace para establecer una nueva contraseña:\n${actionLink}\n\n` +
        `Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña actual seguirá siendo válida.\n\n` +
        `REQSYS — ARLIFT S.A.`,
      html: `
        <p>Hola,</p>
        <p>Recibimos una solicitud para recuperar la contraseña de tu cuenta REQSYS (<strong>${nombre}</strong>).</p>
        <p><a href="${actionLink}">ESTABLECER NUEVA CONTRASEÑA</a></p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña actual seguirá siendo válida.</p>
        <p>REQSYS — ARLIFT S.A.</p>
      `,
    })
    await registrarEvento(email, true)
  } catch {
    await registrarEvento(email, false, 'fallo_envio_smtp')
  }

  return NextResponse.json({ mensaje: MENSAJE_GENERICO })
}
