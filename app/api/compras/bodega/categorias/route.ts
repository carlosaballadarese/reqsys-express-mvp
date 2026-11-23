import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

// Spec: HU-026 CA-03 — solo compras/admin crean/editan Categorías. Distingue
// 401/403 explícitamente (ver bodegas/route.ts para el porqué).
async function verificarAdminOCompras(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true }
}

// Spec: HU-026 CA-03/CA-06 — `?area_id=` filtra por el cruce area_categoria_bodega
// (selector dependiente, consumido por el formulario de producto en HU-027).
// `?todas=1` (admin/compras) incluye inactivas y el array area_ids de cada
// categoría, para la pantalla de gestión del cruce.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const todas = searchParams.get('todas') === '1'
  const areaId = searchParams.get('area_id')

  if (areaId) {
    const { data: cruce, error: errorCruce } = await adminClient()
      .from('area_categoria_bodega')
      .select('categoria_id')
      .eq('area_id', areaId)

    if (errorCruce) return NextResponse.json({ error: errorCruce.message }, { status: 500 })

    const categoriaIds = (cruce ?? []).map(c => c.categoria_id)
    if (categoriaIds.length === 0) return NextResponse.json([])

    const { data, error } = await adminClient()
      .from('categorias')
      .select('id, nombre')
      .eq('activo', true)
      .in('id', categoriaIds)
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (todas) {
    const auth = await verificarAdminOCompras()
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

    const { data: categorias, error } = await adminClient()
      .from('categorias')
      .select('id, nombre, activo')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: cruce, error: errorCruce } = await adminClient()
      .from('area_categoria_bodega')
      .select('area_id, categoria_id')

    if (errorCruce) return NextResponse.json({ error: errorCruce.message }, { status: 500 })

    const resultado = (categorias ?? []).map(c => ({
      ...c,
      area_ids: (cruce ?? []).filter(x => x.categoria_id === c.id).map(x => x.area_id),
    }))
    return NextResponse.json(resultado)
  }

  const { data, error } = await adminClient()
    .from('categorias')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Crea una Categoría nueva (catálogo global) — solo compras/admin. `area_ids`
// opcional: siembra el cruce inicial (CA-03/CA-04).
export async function POST(req: NextRequest) {
  const auth = await verificarAdminOCompras()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { nombre, area_ids } = await req.json()
    const nombreLimpio = nombre?.trim()
    if (!nombreLimpio) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('categorias')
      .insert({ nombre: nombreLimpio })
      .select('id, nombre, activo')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una Categoría con ese nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (Array.isArray(area_ids) && area_ids.length > 0) {
      const { error: errorCruce } = await adminClient()
        .from('area_categoria_bodega')
        .insert(area_ids.map((area_id: string) => ({ area_id, categoria_id: data.id })))
      if (errorCruce) return NextResponse.json({ error: errorCruce.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
