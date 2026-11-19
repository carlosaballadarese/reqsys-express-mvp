import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

// Spec: HU-026 CA-08 — mismos roles de escritura que Clientes Finales.
async function verificarBodegaCompasOAdmin(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['bodega', 'compras', 'admin'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const todas = new URL(req.url).searchParams.get('todas') === '1'

  if (todas) {
    const auth = await verificarBodegaCompasOAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

    const { data, error } = await adminClient()
      .from('pozos')
      .select('id, nombre, cliente_final_id, activo')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await adminClient()
    .from('pozos')
    .select('id, nombre, cliente_final_id')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Spec: HU-026 RF-BOD-031 — Cliente Final opcional (ej. destinos internos como
// "ARLIFT - BASE" que no pertenecen a ningún cliente). Sin validación de
// duplicado de `nombre` (sdd-design.md, "Manejo de duplicados").
export async function POST(req: NextRequest) {
  const auth = await verificarBodegaCompasOAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { nombre, cliente_final_id } = await req.json()
    const nombreLimpio = nombre?.trim()
    if (!nombreLimpio) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('pozos')
      .insert({ nombre: nombreLimpio, cliente_final_id: cliente_final_id || null })
      .select('id, nombre, cliente_final_id, activo')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
