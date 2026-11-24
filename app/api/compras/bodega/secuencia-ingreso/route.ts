import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Spec: HU-043 CA-02/CA-06/CA-08 — clon exacto de /api/compras/secuencia/route.ts
// (numeración de NP) apuntando a bodega_secuencia_ingreso (HU-028). Mismo
// contrato: GET abierto a cualquier autenticado, POST solo compras/admin.

// GET — devuelve el estado actual de la secuencia por año
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('bodega_secuencia_ingreso')
    .select('año, ultimo_numero')
    .order('año', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — establece el número inicial para un año
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { año, numero_inicial } = await req.json()

    if (!año || numero_inicial === undefined || numero_inicial < 0) {
      return NextResponse.json({ error: 'Año y número inicial son requeridos' }, { status: 400 })
    }

    // Upsert: si ya existe el año lo actualiza, si no lo crea
    // Se guarda ultimo_numero = numero_inicial - 1 porque la función incrementa antes de retornar
    const { error } = await adminClient()
      .from('bodega_secuencia_ingreso')
      .upsert({ año, ultimo_numero: Math.max(0, Number(numero_inicial) - 1) }, { onConflict: 'año' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, proximo: numero_inicial })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
