import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'

async function verificarAdminOCompras() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  return perfil && ['admin', 'compras'].includes(perfil.rol) ? user : null
}

// Spec: SC-002 — pasa a leer de la tabla `areas` (identidad pura) en vez de
// derivar valores únicos de coordinadores_area.area (texto legado). Devuelve
// {id, nombre} — el frontend selecciona por id, no por texto (Tarea 14).
// Sin `?todas=1`: público, solo áreas activas (usado por Nueva NP, cualquier rol).
// Con `?todas=1`: admin/compras, incluye inactivas + campo `activo` (gestión de catálogo).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const todas      = searchParams.get('todas') === '1'
  const soloBodega = searchParams.get('solo_bodega') === '1'

  if (todas) {
    const user = await verificarAdminOCompras()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { data, error } = await adminClient()
      .from('areas')
      .select('id, nombre, activo, habilitada_para_bodega')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  try {
    // Spec: HU-027 CA-01b — selector de Área como ayuda de UX en el formulario
    // de producto (filtra las opciones de Categoría vía HU-026); público, sin
    // restricción de rol, igual que el resto de este endpoint — cualquier rol
    // que crea/edita productos (incluido `bodega`) necesita esta lista.
    let query = anonClient()
      .from('areas')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')

    if (soloBodega) query = query.eq('habilitada_para_bodega', true)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error fetching areas:', err)
    return NextResponse.json({ error: 'Error al obtener áreas' }, { status: 500 })
  }
}

// Crea un área nueva en el catálogo — admin/compras.
export async function POST(req: NextRequest) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { nombre } = await req.json()
    const nombreLimpio = nombre?.trim()
    if (!nombreLimpio) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('areas')
      .insert({ nombre: nombreLimpio })
      .select('id, nombre, activo')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un área con ese nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
