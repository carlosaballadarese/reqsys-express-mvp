import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [{ data: np, error }, { data: items }, { data: historial }] = await Promise.all([
      supabaseAdmin.from('notas_pedido').select('*').eq('id', id).single(),
      supabaseAdmin.from('items_np').select('*').eq('nota_pedido_id', id).order('linea'),
      supabaseAdmin.from('historial_np').select('*').eq('np_id', id).order('fecha', { ascending: true }),
    ])

    if (error || !np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    return NextResponse.json({ np, items: items ?? [], historial: historial ?? [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
