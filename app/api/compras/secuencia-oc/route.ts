import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'


export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('oc_secuencia')
    .select('año, ultimo_numero')
    .order('año', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const { año, numero_inicial } = await req.json()

    if (!año || numero_inicial === undefined || numero_inicial < 0) {
      return NextResponse.json({ error: 'Año y número inicial son requeridos' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('oc_secuencia')
      .upsert({ año, ultimo_numero: Math.max(0, Number(numero_inicial) - 1) }, { onConflict: 'año' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, proximo: numero_inicial })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
