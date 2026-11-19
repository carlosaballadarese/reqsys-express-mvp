import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { validarRucEcuador } from '@/lib/validators'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

// Spec: HU-026 CA-07 — a diferencia de Bodegas/Categorías, el rol `bodega`
// también puede escribir este catálogo.
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
      .from('clientes_finales')
      .select('id, nombre, ruc, activo')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await adminClient()
    .from('clientes_finales')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await verificarBodegaCompasOAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { nombre, ruc } = await req.json()
    const nombreLimpio = nombre?.trim()
    if (!nombreLimpio) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    if (ruc?.trim() && !validarRucEcuador(ruc.trim())) {
      return NextResponse.json({ error: 'El RUC no tiene un formato válido (13 dígitos, provincia 01-24)' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('clientes_finales')
      .insert({ nombre: nombreLimpio, ruc: ruc?.trim() || null })
      .select('id, nombre, ruc, activo')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un Cliente Final con ese nombre' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
