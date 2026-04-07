import { NextRequest, NextResponse } from 'next/server'
import { anonClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const { data, error } = await anonClient()
    .from('inventario')
    .select('id, codigo, descripcion, costo_unitario, saldo_existencias, categoria')
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
    .limit(10)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data)
}
