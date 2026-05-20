import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Obtenemos las áreas únicas de la tabla de coordinadores
  const { data, error } = await adminClient()
    .from('coordinadores_area')
    .select('area')
    .order('area')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Extraer nombres únicos
  const areas = Array.from(new Set((data ?? []).map(d => d.area)))
  
  return NextResponse.json(areas)
}
