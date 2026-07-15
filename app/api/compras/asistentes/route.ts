import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

export async function GET(_req: NextRequest) {
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

  // Spec: HU-010 CA-02, CA-03 — comprador puede ser asistente_compras o compras
  // (incluido el propio Coordinador). admin queda excluido por no estar en la lista.
  const { data, error } = await adminClient()
    .from('perfiles')
    .select('id, nombre, email')
    .in('rol', ['asistente_compras', 'compras'])
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
