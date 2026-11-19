import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionIngreso } from '@/lib/bodega-ingreso'

// Spec: HU-028 CA-02/CA-03 — listado de Documentos de Ingreso. La creación
// manual (sin OC de origen) queda para HU-029 — aquí solo lectura.
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const url = new URL(req.url)
  const estado = url.searchParams.get('estado')

  let query = adminClient()
    .from('documentos_ingreso')
    .select('id, numero, bodega_id, estado, registro_compras_id, created_at, cerrado_en')
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
