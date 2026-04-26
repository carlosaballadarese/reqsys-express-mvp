import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { anonClient } from '@/lib/supabase/clients'


export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data, error } = await anonClient()
    .from('inventario')
    .select('codigo')
    .like('codigo', 'AL-I%')
    .order('codigo', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Extraer el número más alto de los códigos AL-IXXXX
  let max = 0
  for (const row of data ?? []) {
    const match = row.codigo?.match(/^AL-I(\d+)$/)
    if (match) {
      const n = parseInt(match[1])
      if (n > max) max = n
    }
  }

  const siguiente = `AL-I${String(max + 1).padStart(4, '0')}`
  return NextResponse.json({ codigo: siguiente })
}
