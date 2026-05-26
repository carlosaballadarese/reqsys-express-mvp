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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accesos = await verificarAccesos()
  if (!accesos) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id }                           = await params
    const { nombre, rol, activo, email }   = await req.json()

    if (!nombre || !rol) {
      return NextResponse.json({ error: 'nombre y rol son requeridos' }, { status: 400 })
    }

    // Leer usuario destino para validaciones
    const { data: destino } = await adminClient()
      .from('perfiles')
      .select('email, rol')
      .eq('id', id)
      .single()

    if (!destino) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Spec: compras no puede editar usuarios con rol admin
    if (accesos.perfil.rol === 'compras' && destino.rol === 'admin') {
      return NextResponse.json({ error: 'No puedes modificar cuentas de Administrador' }, { status: 403 })
    }

    // Actualizar nombre, rol y activo en perfiles
    const { error: updateError } = await adminClient()
      .from('perfiles')
      .update({ nombre, rol, activo: activo !== false })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Spec: cambio de email — solo si viene en el body y es distinto al actual
    const emailNuevo = email?.trim().toLowerCase()
    const emailActual = destino.email?.toLowerCase()

    if (emailNuevo && emailNuevo !== emailActual) {
      // Spec: nadie puede cambiar su propio email
      if (id === accesos.user.id) {
        return NextResponse.json({ error: 'No puedes cambiar tu propio correo electrónico' }, { status: 403 })
      }

      // Validar formato básico
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNuevo)) {
        return NextResponse.json({ error: 'El formato del correo electrónico no es válido' }, { status: 400 })
      }

      // Spec: verificar unicidad en perfiles
      const { data: existente } = await adminClient()
        .from('perfiles')
        .select('id')
        .eq('email', emailNuevo)
        .neq('id', id)
        .single()

      if (existente) {
        return NextResponse.json({ error: 'El correo electrónico ya está en uso por otro usuario' }, { status: 409 })
      }

      // Actualizar en Supabase Auth
      const { error: authError } = await adminClient()
        .auth.admin.updateUserById(id, { email: emailNuevo, email_confirm: true })

      if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

      // Actualizar en perfiles
      await adminClient().from('perfiles').update({ email: emailNuevo }).eq('id', id)

      // Spec: notificación al correo nuevo
      try {
        await transporter.sendMail({
          from:    'REQSYS ARLIFT <reqsys.cabe@gmail.com>',
          to:      emailNuevo,
          subject: 'REQSYS — Tu correo de acceso ha sido actualizado',
          text: [
            `Estimado/a ${nombre},`,
            '',
            'El correo electrónico de acceso a tu cuenta REQSYS ha sido actualizado.',
            '',
            `Nuevo correo: ${emailNuevo}`,
            'Usa este correo para iniciar sesión a partir de ahora.',
            '',
            'Si no solicitaste este cambio, contacta al Administrador del sistema.',
            '',
            'REQSYS — ARLIFT S.A.',
          ].join('\n'),
        })
      } catch (emailErr) {
        console.error('ERROR SMTP cambio email (ignorado):', emailErr)
      }

      await registrarAuditoria({
        accion:     'cambiar_email_usuario',
        entidad:    'usuario',
        entidad_id: id,
        referencia: emailNuevo,
        detalle:    { email_anterior: destino.email, email_nuevo: emailNuevo, nombre },
      })
    }

    await registrarAuditoria({
      accion:     'editar_usuario',
      entidad:    'usuario',
      entidad_id: id,
      referencia: emailNuevo ?? destino.email,
      detalle:    { nombre, rol, activo: activo !== false },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accesos = await verificarAccesos()
  if (!accesos) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id }       = await params
    const { password } = await req.json()

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const { error } = await adminClient().auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('email').eq('id', id).single()

    await registrarAuditoria({
      accion:     'reset_password',
      entidad:    'usuario',
      entidad_id: id,
      referencia: perfil?.email ?? id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const accesos = await verificarAccesos()
  if (!accesos) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params

    // Spec: nadie puede eliminar su propia cuenta
    if (id === accesos.user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 403 })
    }

    const { data: destino } = await adminClient()
      .from('perfiles')
      .select('email, nombre, rol')
      .eq('id', id)
      .single()

    if (!destino) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Spec: compras no puede eliminar usuarios admin
    if (accesos.perfil.rol === 'compras' && destino.rol === 'admin') {
      return NextResponse.json({ error: 'No puedes eliminar cuentas de Administrador' }, { status: 403 })
    }

    // Spec: bloquear si tiene NPs asignadas activas
    const { count: npsActivas } = await adminClient()
      .from('notas_pedido')
      .select('id', { count: 'exact', head: true })
      .eq('asignado_a', id)
      .not('estado', 'in', '("completada","rechazada")')

    // Spec: bloquear si tiene OCs activas creadas por el usuario
    const { count: ocsActivas } = await adminClient()
      .from('registro_compras')
      .select('id', { count: 'exact', head: true })
      .eq('creado_por_id', id)
      .not('estado_oc', 'in', '("aprobada","rechazada")')

    const nps = npsActivas ?? 0
    const ocs = ocsActivas ?? 0

    if (nps > 0 || ocs > 0) {
      return NextResponse.json({
        error:       'El usuario tiene registros activos. Reasigne antes de eliminar.',
        nps_activas: nps,
        ocs_activas: ocs,
      }, { status: 400 })
    }

    // Eliminación física: primero Auth, luego perfil
    const { error: authError } = await adminClient().auth.admin.deleteUser(id)
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    await adminClient().from('perfiles').delete().eq('id', id)

    await registrarAuditoria({
      accion:     'eliminar_usuario',
      entidad:    'usuario',
      entidad_id: id,
      referencia: destino.email,
      detalle:    { nombre: destino.nombre, rol: destino.rol },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
