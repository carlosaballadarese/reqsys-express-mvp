import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ESTADOS_VALIDOS = ['en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras', 'rechazada', 'aprobada']


// Spec: SC-003 CA-06 — este endpoint no tenía ningún chequeo de sesión ni
// de rol; cualquiera podía cambiar el estado de cualquier OC sin pasar por
// /aprobar (bypass del flujo de validación de monto/aprobador). Mismo
// patrón de auth+ownership ya usado en enviar-aprobacion/route.ts.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id }     = await params
    const { estado } = await req.json()

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
    }

    // Leer OC actual
    const { data: ocActual } = await adminClient()
      .from('registro_compras')
      .select('numero_oc, estado_oc, creado_por_id')
      .eq('id', id)
      .single()

    if (!ocActual) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (perfil.rol === 'asistente_compras' && ocActual.creado_por_id !== user.id)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
