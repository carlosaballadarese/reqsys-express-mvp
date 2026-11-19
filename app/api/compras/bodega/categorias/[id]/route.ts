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

// Spec: HU-026 CA-03/CA-06, sdd-design.md "Decisión 2" — si `area_ids` viene en
// el body, reemplaza COMPLETO el cruce de esta categoría (DELETE+INSERT), no un
// diff incremental — mismo patrón ya usado en items_oc/oca_items del proyecto.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAdminOCompras()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const { nombre, activo, area_ids } = await req.json()

    const update: { nombre?: string; activo?: boolean } = {}
    if (typeof nombre === 'string') {
      const nombreLimpio = nombre.trim()
      if (!nombreLimpio) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombreLimpio
    }
    if (typeof activo === 'boolean') update.activo = activo

    if (Object.keys(update).length > 0) {
      const { error } = await adminClient().from('categorias').update(update).eq('id', id)
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Ya existe una Categoría con ese nombre' }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (Array.isArray(area_ids)) {
      const { error: errorDelete } = await adminClient()
        .from('area_categoria_bodega')
        .delete()
        .eq('categoria_id', id)
      if (errorDelete) return NextResponse.json({ error: errorDelete.message }, { status: 500 })

      if (area_ids.length > 0) {
        const { error: errorInsert } = await adminClient()
          .from('area_categoria_bodega')
          .insert(area_ids.map((area_id: string) => ({ area_id, categoria_id: id })))
        if (errorInsert) return NextResponse.json({ error: errorInsert.message }, { status: 500 })
      }
    }

    if (Object.keys(update).length === 0 && !Array.isArray(area_ids)) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
