import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionIngreso } from '@/lib/bodega-ingreso'

// Spec: hallazgo real de usuario (2026-11-22) — al seleccionar un producto
// en una línea de Documento de Ingreso, el Costo Unitario debe sugerirse
// con el costo de la última ENTRADA real de ese producto en el Kardex
// (nunca el promedio ponderado vigente de inventario.costo_unitario, que
// mezcla historial), quedando siempre editable. null si el producto nunca
// tuvo una entrada registrada (alta nueva, sin historial).
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const productoId = req.nextUrl.searchParams.get('producto_id')
  if (!productoId) {
    return NextResponse.json({ error: 'producto_id es requerido' }, { status: 400 })
  }

  const { data } = await adminClient()
    .from('kardex_movimientos')
    .select('costo_unitario')
    .eq('producto_id', productoId)
    .eq('direccion', 'entrada')
    .order('fecha', { ascending: false })
    .order('secuencia_historica', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ costo_unitario: data ? Number(data.costo_unitario) : null })
}
