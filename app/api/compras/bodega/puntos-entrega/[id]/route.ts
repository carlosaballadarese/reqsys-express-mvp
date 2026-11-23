import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

async function verificarBodegaCompasOAdmin(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['bodega', 'compras', 'admin'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarBodegaCompasOAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const { nombre, cliente_final_id, activo } = await req.json()

    const update: { nombre?: string; cliente_final_id?: string | null; activo?: boolean } = {}
    if (typeof nombre === 'string') {
      const nombreLimpio = nombre.trim()
      if (!nombreLimpio) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombreLimpio
    }
    if (cliente_final_id !== undefined) update.cliente_final_id = cliente_final_id || null
    if (typeof activo === 'boolean') update.activo = activo

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('puntos_entrega')
      .update(update)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
