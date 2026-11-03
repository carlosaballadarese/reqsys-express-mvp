import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q')?.trim()
  if (!raw || raw.length < 2) return NextResponse.json([])

  // Eliminar caracteres especiales de PostgREST para evitar errores en .or()
  const q = raw.replace(/[%(),.]/g, ' ').trim()
  if (q.length < 2) return NextResponse.json([])

  // Spec: endpoint público (sin sesión, sin token) usado por /editar/[token] —
  // costo_unitario se excluye del select a propósito: es dato sensible de
  // negocio (costo real de compra) y no debe ser visible sin autenticación,
  // consistente con puedeVerPrecioNP (solicitante/bodega tampoco lo ven en
  // el flujo logueado normal).
  const { data, error } = await adminClient()
    .from('inventario')
    .select('id, codigo, descripcion, saldo_existencias, categoria')
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
    .limit(10)

  if (error) {
    console.error('inventario/search error:', error)
    return NextResponse.json([], { status: 500 })
  }
  return NextResponse.json(data)
}
