import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { validarRucEcuador } from '@/lib/validators'

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
    const { nombre, ruc, activo } = await req.json()

    const update: { nombre?: string; ruc?: string | null; activo?: boolean } = {}
    if (typeof nombre === 'string') {
      const nombreLimpio = nombre.trim()
      if (!nombreLimpio) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombreLimpio
    }
    if (ruc !== undefined) {
      const rucLimpio = ruc?.trim() || null
      if (rucLimpio && !validarRucEcuador(rucLimpio)) {
        return NextResponse.json({ error: 'El RUC no tiene un formato válido (13 dígitos, provincia 01-24)' }, { status: 400 })
      }
      update.ruc = rucLimpio
    }
    if (typeof activo === 'boolean') update.activo = activo

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('clientes_finales')
      .update(update)
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un Cliente Final con ese nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
