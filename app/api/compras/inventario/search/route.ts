import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q')?.trim()
  if (!raw || raw.length < 2) return NextResponse.json([])

  // Eliminar caracteres especiales de PostgREST para evitar errores en .or()
  const q = raw.replace(/[%(),.]/g, ' ').trim()
  if (q.length < 2) return NextResponse.json([])

  const { data, error } = await adminClient()
    .from('inventario')
    .select('id, codigo, descripcion, costo_unitario, saldo_existencias, categoria')
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
    .limit(10)

  if (error) {
    console.error('inventario/search error:', error)
    return NextResponse.json([], { status: 500 })
  }
  return NextResponse.json(data)
}
