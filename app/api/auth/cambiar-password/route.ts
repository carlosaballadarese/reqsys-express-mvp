import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'

function validarPassword(p: string): string | null {
  if (p.length < 8)             return 'La contraseña debe tener al menos 8 caracteres.'
  if (!/[A-Z]/.test(p))         return 'Debe incluir al menos una letra mayúscula.'
  if (!/[0-9]/.test(p))         return 'Debe incluir al menos un número.'
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { passwordActual?: string; passwordNuevo?: string; passwordConfirm?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const { passwordActual, passwordNuevo, passwordConfirm } = body

  if (!passwordActual || !passwordNuevo || !passwordConfirm)
    return NextResponse.json({ error: 'Todos los campos son requeridos.' }, { status: 400 })

  if (passwordNuevo !== passwordConfirm)
    return NextResponse.json({ error: 'La nueva contraseña y su confirmación no coinciden.' }, { status: 400 })

  if (passwordActual === passwordNuevo)
    return NextResponse.json({ error: 'La nueva contraseña debe ser diferente a la actual.' }, { status: 400 })

  const error = validarPassword(passwordNuevo)
  if (error) return NextResponse.json({ error }, { status: 400 })

  // Verificar contraseña actual
  const { error: authError } = await anonClient().auth.signInWithPassword({
    email: user.email!,
    password: passwordActual,
  })
  if (authError)
    return NextResponse.json({ error: 'La contraseña actual es incorrecta.' }, { status: 400 })

  // Actualizar contraseña
  const { error: updateError } = await adminClient().auth.admin.updateUserById(user.id, {
    password: passwordNuevo,
  })
  if (updateError)
    return NextResponse.json({ error: 'Error al actualizar la contraseña. Intente de nuevo.' }, { status: 500 })

  // Notificación por email (sin URLs por restricción ClamAV)
  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('nombre, email')
    .eq('id', user.id)
    .single()

  const nombre = perfil?.nombre ?? user.email
  const correo = perfil?.email ?? user.email

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to:      correo,
      subject: 'REQSYS — Contraseña actualizada',
      text:
        `Hola ${nombre},\n\n` +
        `Tu contraseña en el sistema REQSYS fue cambiada exitosamente.\n\n` +
        `Si no realizaste este cambio, contacta de inmediato al administrador del sistema.\n\n` +
        `REQSYS — ARLIFT S.A.`,
    })
  } catch {
    // El cambio fue exitoso — el email es solo notificación
  }

  return NextResponse.json({ ok: true })
}
