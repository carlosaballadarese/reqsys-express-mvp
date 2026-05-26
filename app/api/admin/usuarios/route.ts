import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { transporter } from '@/lib/mailer'

// Spec: admin y compras tienen acceso completo al módulo de Accesos
async function verificarAccesos() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) return null
  return { user, perfil }
}

export async function GET() {
  const accesos = await verificarAccesos()
  if (!accesos) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error } = await adminClient()
    .from('perfiles')
    .select('id, email, nombre, rol, activo, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const accesos = await verificarAccesos()
  if (!accesos) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { email, nombre, rol, password } = await req.json()

    if (!email || !nombre || !rol || !password) {
      return NextResponse.json({ error: 'email, nombre, rol y password son requeridos' }, { status: 400 })
    }

    const { data: authData, error: authError } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? 'Error al crear usuario' }, { status: 500 })
    }

    const { error: perfilError } = await adminClient()
      .from('perfiles')
      .insert({ id: authData.user.id, email, nombre, rol, activo: true })

    if (perfilError) {
      await adminClient().auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: perfilError.message }, { status: 500 })
    }

    await registrarAuditoria({
      accion:     'crear_usuario',
      entidad:    'usuario',
      entidad_id: authData.user.id,
      referencia: email,
      detalle:    { nombre, rol },
    })

    // Spec: notificación de bienvenida al correo del nuevo usuario
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reqsys-express.vercel.app'
    try {
      await transporter.sendMail({
        from:    'REQSYS ARLIFT <reqsys.cabe@gmail.com>',
        to:      email,
        subject: 'Bienvenido a REQSYS — ARLIFT S.A.',
        text: [
          `Estimado/a ${nombre},`,
          '',
          'Se ha creado una cuenta de acceso para usted en el sistema REQSYS de ARLIFT S.A.',
          '',
          `Correo de acceso: ${email}`,
          'Contraseña: la proporcionada por el Administrador.',
          '',
          `Ingrese al sistema en: ${appUrl}`,
          '',
          'Se recomienda cambiar su contraseña en el primer ingreso desde el menú de usuario.',
          '',
          'REQSYS — ARLIFT S.A.',
        ].join('\n'),
      })
    } catch (emailErr) {
      console.error('ERROR SMTP bienvenida (ignorado):', emailErr)
    }

    return NextResponse.json({ success: true, id: authData.user.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
