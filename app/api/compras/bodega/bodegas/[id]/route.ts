import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

async function verificarAdminOCompras(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true }
}

// Spec: HU-026 CA-01/CA-05 — edición parcial, sin DELETE físico. Desactivar
// (activo:false) es la única vía de retiro; no afecta a registros que ya
// referencian esta Bodega.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAdminOCompras()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const { codigo, nombre, referencia, activo } = await req.json()

    const update: { codigo?: string; nombre?: string; referencia?: string | null; activo?: boolean } = {}
    if (typeof codigo === 'string') {
      const codigoLimpio = codigo.trim()
      if (!codigoLimpio) return NextResponse.json({ error: 'El código no puede quedar vacío' }, { status: 400 })
      update.codigo = codigoLimpio
    }
    if (typeof nombre === 'string') {
      const nombreLimpio = nombre.trim()
      if (!nombreLimpio) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombreLimpio
    }
    if (referencia !== undefined) update.referencia = referencia?.trim() || null
    if (typeof activo === 'boolean') update.activo = activo

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('bodegas')
      .update(update)
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una Bodega con ese código o nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
