import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { enviarNPACoordinador } from '@/lib/np-notificacion'

// Spec: HU-009 CA-01, CA-14, CA-16
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select(`
        id, estado, numero, creado_por_id,
        solicitante_nombre, solicitante_email, area, prioridad,
        tipo_compra, centro_costo, descripcion_general, total_estimado,
        es_regularizacion, fecha_provision
      `)
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Spec CA-14: solo el creador puede enviar su propio borrador
    if (np.creado_por_id !== user.id)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    if (np.estado !== 'borrador')
      return NextResponse.json({ error: 'Esta NP no está en estado borrador' }, { status: 400 })

    const { data: items } = await adminClient()
      .from('items_np')
      .select('codigo, descripcion, cantidad, unidad, precio_unitario')
      .eq('nota_pedido_id', id)
      .order('linea')

    const resultado = await enviarNPACoordinador(
      np.id,
      np.numero,
      {
        solicitante_nombre: np.solicitante_nombre,
        solicitante_email:  np.solicitante_email,
        area:               np.area,
        prioridad:          np.prioridad,
        tipo_compra:        np.tipo_compra,
        centro_costo:       np.centro_costo,
        descripcion_general: np.descripcion_general,
        es_regularizacion:  np.es_regularizacion ?? false,
        fecha_provision:    np.fecha_provision,
      },
      items ?? [],
      Number(np.total_estimado) || 0
    )

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 })
    }

    // Spec: HU-009 — helper ya inserta historial_np con estado 'pendiente';
    // aquí solo falta actualizar el estado real de la NP (el helper no lo hace).
    await adminClient()
      .from('notas_pedido')
      .update({ estado: 'pendiente' })
      .eq('id', id)

    await registrarAuditoria({
      accion:     'enviar_np_borrador',
      entidad:    'nota_pedido',
      entidad_id: id,
      referencia: np.numero,
      detalle:    {},
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
