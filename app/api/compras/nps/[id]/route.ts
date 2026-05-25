import { NextRequest, NextResponse } from 'next/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { transporter } from '@/lib/mailer'
import { escapeHtml } from '@/lib/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [{ data: np, error }, { data: items }, { data: historial }] = await Promise.all([
      adminClient().from('notas_pedido').select('*').eq('id', id).single(),
      adminClient().from('items_np').select('*').eq('nota_pedido_id', id).order('linea'),
      adminClient().from('historial_np').select('*').eq('np_id', id).order('fecha', { ascending: true }),
    ])

    if (error || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Calcular si el usuario autenticado puede aprobar esta NP
    let puedeAprobar = false
    try {
      const supabase = await createSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: perfil } = await adminClient()
          .from('perfiles').select('rol, email').eq('id', user.id).single()
        if (perfil) {
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

    return NextResponse.json({ np, items: items ?? [], historial: historial ?? [], puedeAprobar })
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
