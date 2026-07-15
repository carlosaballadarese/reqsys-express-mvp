import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-009 CA-05, CA-06, CA-07, RN-05 — marca/desmarca la Acción de una línea
// (item_np_id) o de todas las líneas de la NP (sin item_np_id). Reversible: pasar
// accion_id = null desmarca. Solo aplica cuando la NP está en 'en_gestion'.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    const rol = perfil?.rol ?? ''

    const { id } = await params
    const { accion_id, item_np_id } = await req.json()

    const { data: np } = await adminClient()
      .from('notas_pedido')
      .select('id, estado, asignado_a')
      .eq('id', id)
      .single()

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Spec CA-05, RN-05: las Acciones solo aplican en estado 'en_gestion'
    if (np.estado !== 'en_gestion') {
      return NextResponse.json(
        { error: `No aplican Acciones en estado '${np.estado}'` },
        { status: 400 }
      )
    }

    const puedeMarcar = rol === 'compras' || rol === 'admin' || np.asignado_a === user.id
    if (!puedeMarcar) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (accion_id !== null) {
      const { data: accion } = await adminClient()
        .from('acciones_gestion')
        .select('id')
        .eq('id', accion_id)
        .single()
      if (!accion) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    // Spec CA-06: reversible — accion_id = null limpia también marcada_en/marcada_por
    const update = {
      accion_id:          accion_id,
      accion_marcada_en:  accion_id !== null ? new Date().toISOString() : null,
      accion_marcada_por: accion_id !== null ? user.id : null,
    }

    let query = adminClient().from('items_np').update(update).eq('nota_pedido_id', id)
    if (item_np_id) query = query.eq('id', item_np_id)

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
