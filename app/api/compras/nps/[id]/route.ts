import { NextRequest, NextResponse } from 'next/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { transporter } from '@/lib/mailer'
import { escapeHtml } from '@/lib/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [{ data: np, error }, { data: items }, { data: historial }, { data: ocs }] = await Promise.all([
      adminClient().from('notas_pedido').select('*').eq('id', id).single(),
      adminClient().from('items_np').select('*').eq('nota_pedido_id', id).order('linea'),
      adminClient().from('historial_np').select('*').eq('np_id', id).order('fecha', { ascending: true }),
      adminClient().from('registro_compras')
        .select('id, numero_oc, proveedor, valor_total, estado_oc, fecha_oc, creado_por_nombre')
        .eq('nota_pedido_id', id)
        .order('created_at', { ascending: true }),
    ])

    if (error || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Calcular permisos del usuario autenticado
    let puedeAprobar    = false
    let puedeVerPrecio  = false
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: perfil } = await adminClient()
          .from('perfiles').select('rol, email').eq('id', user.id).single()
        if (perfil) {
          // Spec: precio visible solo para compras, admin y asistente_compras
          puedeVerPrecio = ['compras', 'admin', 'asistente_compras'].includes(perfil.rol)
          if (['admin', 'compras'].includes(perfil.rol)) {
            puedeAprobar = true
          } else {
            const { data: coord } = await adminClient()
              .from('coordinadores_area')
              .select('id')
              .eq('area', np.area)
              .eq('email', perfil.email)
              .maybeSingle()
            puedeAprobar = !!coord
          }
        }
      }
    } catch {}

    // Spec: enmascarar precios para roles sin permiso
    const npResp    = puedeVerPrecio ? np : { ...np, total_estimado: null }
    const itemsResp = puedeVerPrecio
      ? (items ?? [])
      : (items ?? []).map((item: any) => ({ ...item, precio_unitario: null }))

    return NextResponse.json({ np: npResp, items: itemsResp, historial: historial ?? [], puedeAprobar, ocs: ocs ?? [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(
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

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, numero, estado, area, creado_por_id, solicitante_nombre, token_aprobacion, motivo_rechazo')
      .eq('id', id)
      .single()

    // Spec: solo NPs en estado rechazada pueden editarse por este flujo
    if (!np || np.estado !== 'rechazada')
      return NextResponse.json({ error: 'NP no encontrada o no está en estado rechazada' }, { status: 404 })

    // Spec: puede editar el creador (creado_por_id) o roles compras/admin
    const esManager      = ['compras', 'admin'].includes(perfil.rol)
    const esCreador       = np.creado_por_id === user.id
    const puedeVerPrecio  = ['compras', 'admin', 'asistente_compras'].includes(perfil.rol)
    if (!esManager && !esCreador)
      return NextResponse.json({ error: 'No tienes permiso para editar esta NP' }, { status: 403 })

    const { encabezado, items } = await req.json()

    if (!items || items.length === 0)
      return NextResponse.json({ error: 'La NP debe tener al menos un ítem' }, { status: 400 })

    // Buscar coordinador del área (puede haber cambiado en el encabezado)
    const { data: coordinador } = await adminClient()
      .from('coordinadores_area')
      .select('nombre, email')
      .eq('area', encabezado.area)
      .single()

    if (!coordinador)
      return NextResponse.json({ error: 'No se encontró coordinador para el área seleccionada' }, { status: 400 })

    const totalEstimado = puedeVerPrecio
      ? (items as { cantidad: number; precio_unitario: number }[]).reduce(
          (acc, item) => acc + (item.cantidad || 0) * (item.precio_unitario || 0),
          0
        )
      : 0

    // Actualizar encabezado: vuelve a pendiente, limpia motivo_rechazo (queda en historial)
    const { error: updateError } = await adminClient()
      .from('notas_pedido')
      .update({
        solicitante_nombre:  encabezado.solicitante_nombre,
        solicitante_email:   encabezado.solicitante_email,
        area:                encabezado.area,
        prioridad:           encabezado.prioridad,
        tipo_compra:         encabezado.tipo_compra,
        centro_costo:        encabezado.centro_costo,
        descripcion_general: encabezado.descripcion_general,
        total_estimado:      totalEstimado,
        estado:              'pendiente',
        motivo_rechazo:      null,
      })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Reemplazar ítems
    await adminClient().from('items_np').delete().eq('nota_pedido_id', id)
    const itemsConNP = (items as {
      codigo: string; descripcion: string; unidad: string
      cantidad: number; precio_unitario: number; proveedor_sugerido?: string
    }[]).map((item, index) => ({
      nota_pedido_id:     id,
      linea:              index + 1,
      codigo:             item.codigo || null,
      descripcion:        item.descripcion,
      unidad:             item.unidad,
      cantidad:           item.cantidad,
      precio_unitario:    puedeVerPrecio ? (item.precio_unitario || 0) : 0,
      proveedor_sugerido: item.proveedor_sugerido || null,
    }))
    await adminClient().from('items_np').insert(itemsConNP)

    // Spec: historial registra reenviada con referencia al motivo del rechazo previo
    const motivoPrevio = np.motivo_rechazo
      ? `Rechazo previo: "${np.motivo_rechazo}"`
      : 'NP reenviada tras corrección'
    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'reenviada',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        `NP reenviada a aprobación. ${motivoPrevio}`,
    })

    await registrarAuditoria({
      accion:     'reenviar_np',
      entidad:    'nota_pedido',
      entidad_id: id,
      referencia: np.numero,
      detalle:    { estado_anterior: 'rechazada', estado_nuevo: 'pendiente' },
    })

    // Email al coordinador con links de aprobación
    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const urlAprobar = `${baseUrl}/aprobar/${np.token_aprobacion}?accion=aprobar`
    const urlRechazar = `${baseUrl}/aprobar/${np.token_aprobacion}?accion=rechazar`
    try {
      await transporter.sendMail({
        from:    'One ARLIFT <one.arlift@arlift.com.ec>',
        to:      coordinador.email,
        subject: `REQSYS NP Corregida ${np.numero} - ${encabezado.area}`,
        text: [
          `Estimado/a ${coordinador.nombre},`,
          '',
          `La Nota de Pedido ${np.numero} que fue rechazada ha sido corregida y reenviada para aprobacion.`,
          `Solicitante: ${encabezado.solicitante_nombre}`,
          `Area: ${encabezado.area}`,
          `Total estimado: $${totalEstimado.toFixed(2)}`,
          '',
          `Aprobar: ${urlAprobar}`,
          `Rechazar: ${urlRechazar}`,
          '',
          'REQSYS - ARLIFT S.A.',
        ].join('\n'),
      })
    } catch (emailErr) {
      console.error('ERROR SMTP (ignorado):', emailErr)
    }

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
  try {
    const { id } = await params
    const { accion, motivo } = await req.json()

    if (!['aprobar', 'rechazar', 'devolver'].includes(accion)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    // 1. Verificar permisos
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const esRolPrivilegiado = ['admin', 'compras'].includes(perfil.rol)

    // Los coordinadores de área pueden aprobar/rechazar NPs de su área aunque no tengan rol privilegiado
    let esCoordinadorDelArea = false
    if (!esRolPrivilegiado && (accion === 'aprobar' || accion === 'rechazar')) {
      const { data: npPrevia } = await adminClient().from('notas_pedido').select('area').eq('id', id).single()
      if (npPrevia) {
        const { data: coord } = await adminClient()
          .from('coordinadores_area')
          .select('email')
          .eq('area', npPrevia.area)
          .eq('email', perfil.email)
          .single()
        esCoordinadorDelArea = !!coord
      }
    }

    if (!esRolPrivilegiado && !esCoordinadorDelArea) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Solo compras/admin pueden devolver
    if (accion === 'devolver' && !esRolPrivilegiado) {
      return NextResponse.json({ error: 'Solo Compras puede devolver una NP' }, { status: 403 })
    }

    // 2. Buscar NP
    const { data: np, error: errorNP } = await adminClient().from('notas_pedido').select('*').eq('id', id).single()
    if (errorNP || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Validar estados
    if (accion === 'devolver' && np.estado !== 'aprobada') {
      return NextResponse.json({ error: 'Solo se pueden devolver NPs ya aprobadas' }, { status: 400 })
    }
    if ((accion === 'aprobar' || accion === 'rechazar') && np.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Solo se pueden procesar NPs pendientes' }, { status: 400 })
    }

    const nuevoEstado = accion === 'aprobar' ? 'aprobada' : (accion === 'rechazar' ? 'rechazada' : 'devuelta')
    const esAprobada = accion === 'aprobar'

    // 3. Notificaciones por Email — texto plano sin URLs para evitar filtros antivirus
    try {
      if (esAprobada) {
        const { data: compras } = await anonClient().from('coordinadores_area').select('nombre, email').eq('area', 'Compras').single()
        if (compras) {
          await transporter.sendMail({
            from: 'One ARLIFT <one.arlift@arlift.com.ec>',
            to: compras.email,
            subject: `REQSYS NP Aprobada ${np.numero} - ${np.area}`,
            text: [
              `Estimado/a ${compras.nombre},`,
              '',
              `La Nota de Pedido ${np.numero} del area ${np.area} fue aprobada y requiere su gestion.`,
              `Total estimado: $${Number(np.total_estimado).toFixed(2)}`,
              '',
              `Ingrese al sistema REQSYS para gestionarla.`,
              '',
              'REQSYS - ARLIFT S.A.',
            ].join('\n'),
          })
        }
      }

      const estadoTexto = accion === 'devolver' ? 'devuelta para correcciones' : nuevoEstado
      await transporter.sendMail({
        from: 'One ARLIFT <one.arlift@arlift.com.ec>',
        to: np.solicitante_email,
        subject: `REQSYS NP ${np.numero} ${estadoTexto}`,
        text: [
          `Estimado/a ${np.solicitante_nombre},`,
          '',
          `La Nota de Pedido ${np.numero} ha sido ${estadoTexto}.`,
          ...(motivo ? ['', `Notas: ${motivo}`] : []),
          '',
          `Ingrese al sistema REQSYS para ver el detalle.`,
          '',
          'REQSYS - ARLIFT S.A.',
        ].join('\n'),
      })
    } catch (emailErr) {
      console.error('ERROR SMTP (ignorado):', emailErr)
    }

    // 4. Actualizar base de datos
    const updateData: any = { estado: nuevoEstado }
    if (accion === 'rechazar') updateData.motivo_rechazo = motivo
    if (accion === 'devolver') updateData.motivo_devolucion = motivo

    await adminClient().from('notas_pedido').update(updateData).eq('id', id)

    // Registrar historial
    await adminClient().from('historial_np').insert({
      np_id: id,
      estado: nuevoEstado,
      actor_email: perfil.email,
      actor_nombre: perfil.nombre,
      notas: motivo || (esAprobada ? 'Aprobada desde el portal' : `Acción: ${accion}`),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
