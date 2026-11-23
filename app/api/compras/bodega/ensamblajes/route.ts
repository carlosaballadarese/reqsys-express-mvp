import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionEnsamblaje, crearOrdenEnsamblaje } from '@/lib/bodega-ensamblaje'

// Spec: HU-031 CA-01/CA-05 — listado y creación de Órdenes de Ensamblaje.
export async function GET() {
  const auth = await verificarAutorizacionEnsamblaje()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { data, error } = await adminClient()
    .from('ordenes_ensamblaje')
    .select('id, numero, bodega_id, estado, created_at, confirmado_en')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await verificarAutorizacionEnsamblaje()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const body = await req.json()
  const resultado = await crearOrdenEnsamblaje(
    {
      bodegaId: body.bodega_id,
      insumos: Array.isArray(body.insumos) ? body.insumos : [],
      resultados: Array.isArray(body.resultados) ? body.resultados : [],
    },
    { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol }
  )

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ orden_id: resultado.ordenId, numero: resultado.numero }, { status: 201 })
}
