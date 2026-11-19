import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true; userId: string } | { ok: false; status: 401 | 403 }

// Spec: HU-026 CA-01 — solo compras/admin crean/editan Bodegas. Distingue
// 401 (sin sesión) de 403 (rol sin permiso) — fix real encontrado al testear
// este archivo: un único helper que devuelve null para ambos casos colapsaba
// la distinción, al revés del patrón estándar documentado en CLAUDE.md.
async function verificarAdminOCompras(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true, userId: user.id }
}

// Spec: HU-026 CA-01/CA-09 — cualquier autenticado puede ver/seleccionar Bodegas
// activas (formularios de movimiento); ?todas=1 (admin/compras) incluye inactivas
// para la pantalla de gestión del catálogo.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const todas = new URL(req.url).searchParams.get('todas') === '1'

  if (todas) {
    const auth = await verificarAdminOCompras()
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

    const { data, error } = await adminClient()
      .from('bodegas')
      .select('id, codigo, nombre, referencia, activo')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await adminClient()
    .from('bodegas')
    .select('id, codigo, nombre, referencia')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Crea una Bodega nueva — solo compras/admin (CA-01). Sin formato forzado en
// `codigo` (CA-10) — texto libre, el patrón opcional vive en configuracion_empresa.
export async function POST(req: NextRequest) {
  const auth = await verificarAdminOCompras()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { codigo, nombre, referencia } = await req.json()
    const codigoLimpio = codigo?.trim()
    const nombreLimpio = nombre?.trim()

    if (!codigoLimpio) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 })
    if (!nombreLimpio) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('bodegas')
      .insert({
        codigo: codigoLimpio,
        nombre: nombreLimpio,
        referencia: referencia?.trim() || null,
      })
      .select('id, codigo, nombre, referencia, activo')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una Bodega con ese código o nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
