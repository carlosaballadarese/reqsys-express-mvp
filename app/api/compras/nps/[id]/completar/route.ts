import { NextRequest, NextResponse } from 'next/server'
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

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id } = await params

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, convertida, numero')
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })
    if (np.estado !== 'aprobada')
      return NextResponse.json({ error: 'Solo se pueden completar NPs en estado aprobada' }, { status: 400 })
    if (!np.convertida)
      return NextResponse.json({ error: 'La NP debe tener al menos una OC antes de marcarse como completada' }, { status: 400 })

    // Spec: asistente solo puede completar NPs asignadas a él
    if (perfil.rol === 'asistente_compras') {
      const { data: npFull } = await adminClient()
        .from('notas_pedido').select('asignado_a').eq('id', id).single()
      if (!npFull || npFull.asignado_a !== user.id)
        return NextResponse.json({ error: 'Solo puedes completar NPs asignadas a ti' }, { status: 403 })
    }

    await adminClient()
      .from('notas_pedido')
      .update({ estado: 'completada' })
      .eq('id', id)

    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'completada',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        'Marcada como completada — todos los ítems gestionados en OC(s)',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
