import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
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
