import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(
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

    if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    // Spec CA-02: motivo obligatorio
    let motivo = ''
    try {
      const body = await req.json()
      motivo = (body?.motivo ?? '').trim()
    } catch {
      // body vacío o no JSON
    }
    if (!motivo)
      return NextResponse.json({ error: 'El motivo de completado es requerido' }, { status: 400 })

    const { id } = await params

    // Spec CA-10: asignado_a incluido para validar asistente; convertida eliminado (CA-10)
    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, numero, asignado_a')
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })
    if (np.estado !== 'aprobada')
      return NextResponse.json({ error: 'Solo se pueden completar NPs en estado aprobada' }, { status: 400 })

    // Spec CA-10: asistente solo puede completar NPs asignadas a él
    if (perfil.rol === 'asistente_compras' && np.asignado_a !== user.id)
      return NextResponse.json({ error: 'Solo puedes completar NPs asignadas a ti' }, { status: 403 })

    // Spec CA-03: grabar estado, flag manual y motivo
    await adminClient()
      .from('notas_pedido')
      .update({ estado: 'completada', completado_manualmente: true, motivo_completado: motivo })
      .eq('id', id)

    // Spec CA-04: historial con motivo visible para todos los roles
    await adminClient().from('historial_np').insert({
      np_id:        id,
      estado:       'completada',
      actor_email:  perfil.email,
      actor_nombre: perfil.nombre,
      notas:        `Marcada como completada manualmente. Motivo: ${motivo}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
