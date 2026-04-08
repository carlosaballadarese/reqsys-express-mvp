import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'

const ESTADOS_VALIDOS = ['en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras', 'rechazada', 'aprobada']


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }     = await params
    const { estado } = await req.json()

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
    }

    // Leer OC actual
    const { data: ocActual } = await adminClient()
      .from('registro_compras')
      .select('numero_oc, estado_oc')
      .eq('id', id)
      .single()

    const { error } = await adminClient()
      .from('registro_compras')
      .update({ estado_oc: estado })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'cambiar_estado_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: ocActual?.numero_oc ?? id,
      detalle:    { estado_anterior: ocActual?.estado_oc, estado_nuevo: estado },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
