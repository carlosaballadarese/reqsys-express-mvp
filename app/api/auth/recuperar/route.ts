import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'
import { registrarAuditoria } from '@/lib/auditoria'
import { escapeHtml } from '@/lib/utils'

const COOLDOWN_MINUTOS = 5
// Hallazgo real 2026-11-02: Gmail (reqsys.cabe@gmail.com, SMTP con app password)
// filtra a spam el correo automatizado dirigido a otras cuentas @gmail.com —
// confirmado con un caso real (el correo llegó, pero a la carpeta de spam del
// destinatario). sendMail() nunca lanza excepción en ese escenario, así que
// no hay forma de detectarlo desde el código — el aviso en pantalla es la
// mitigación inmediata mientras se evalúa una migración a un proveedor de
// correo transaccional dedicado (deuda técnica, no corregida acá).
const MENSAJE_GENERICO = 'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación en breve. Si no lo ves en tu bandeja de entrada, revisa también la carpeta de spam o correo no deseado.'

// Hallazgo real del security review de 2026-11-02 (bug-hunter --security-review):
// el cooldown por email no protege contra alguien con una lista de emails
// reales (patrón predecible nombre.apellido@arlift.com.ec) disparando envíos
// a MUCHAS cuentas distintas en una ráfaga — cada email solo se limita a sí
// mismo. Ventana más amplia por IP, independiente del cooldown por email.
const LIMITE_IP_INTENTOS  = 10
const LIMITE_IP_MINUTOS   = 15

function extraerIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'desconocida'
}

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

// Rate limit por IP — complementa (no reemplaza) el cooldown por email.
async function excedeLimitePorIp(ip: string): Promise<boolean> {
  if (ip === 'desconocida') return false
  const desde = new Date(Date.now() - LIMITE_IP_MINUTOS * 60 * 1000).toISOString()
  const { data } = await adminClient()
    .from('auditoria')
    .select('id')
    .in('accion', ['solicitud_recuperacion', 'solicitud_recuperacion_fallida'])
    .eq('detalle->>ip', ip)
    .gte('created_at', desde)
    .limit(LIMITE_IP_INTENTOS)
  return !!data && data.length >= LIMITE_IP_INTENTOS
}

async function registrarEvento(email: string, ip: string, exito: boolean, detalle?: string): Promise<void> {
  await registrarAuditoria({
    accion:     exito ? 'solicitud_recuperacion' : 'solicitud_recuperacion_fallida',
    entidad:    'usuario',
    referencia: email,
    detalle:    { ip, ...(detalle ? { motivo: detalle } : {}) },
  })
}

export async function POST(req: NextRequest) {
  let body: { email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()
  const ip    = extraerIp(req)

  // Spec: SC-006 CA-01 — formato inválido es el único caso que no responde con el mensaje genérico
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 })
  }

  // Hallazgo real del security review de 2026-11-02 — rate limit por IP,
  // independiente del cooldown por email (ver comentario junto a la constante).
  if (await excedeLimitePorIp(ip)) {
    return NextResponse.json(
      { error: 'Demasiados intentos desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429 }
    )
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
    await registrarEvento(email, ip, true)
  } catch {
    await registrarEvento(email, ip, false, 'fallo_envio_smtp')
  }

  return NextResponse.json({ mensaje: MENSAJE_GENERICO })
}
