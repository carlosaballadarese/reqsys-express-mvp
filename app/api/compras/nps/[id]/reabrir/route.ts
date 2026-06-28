import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
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

    // Spec: solo compras y admin pueden reabrir NPs
    if (!perfil || !['compras', 'admin'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, numero')
      .eq('id', id)
      .single()

    // Spec: solo se pueden reabrir NPs en estado completada
    if (!np || np.estado !== 'completada')
      return NextResponse.json({ error: 'NP no encontrada o no está en estado completada' }, { status: 404 })

    // Spec CA-11: limpiar flag y motivo de completado manual al reabrir
    await adminClient()
      .from('notas_pedido')
      .update({ estado: 'aprobada', completado_manualmente: false, motivo_completado: null })
      .eq('id', id)

    // Spec: registrar en historial de la NP
    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'reabierta',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        'NP reabierta — estado anterior: completada',
    })

    await registrarAuditoria({
      accion:     'reabrir_np',
      entidad:    'nota_pedido',
      entidad_id: id,
      referencia: np.numero,
      detalle:    { estado_anterior: 'completada', estado_nuevo: 'aprobada' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
