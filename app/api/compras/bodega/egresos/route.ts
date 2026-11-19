import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionEgreso, crearDocumentoEgreso } from '@/lib/bodega-egreso'

// Spec: HU-030 CA-01/CA-04 — listado y creación de Documentos de Egreso.
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionEgreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const url = new URL(req.url)
  const estado = url.searchParams.get('estado')
  const tipo = url.searchParams.get('tipo')

  let query = adminClient()
    .from('documentos_egreso')
    .select('id, numero, bodega_id, tipo, estado, cliente_final_id, pozo_id, override_admin, created_at, cerrado_en')
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await verificarAutorizacionEgreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const body = await req.json()
  const resultado = await crearDocumentoEgreso(
    {
      tipo: body.tipo,
      bodegaId: body.bodega_id,
      clienteFinalId: body.cliente_final_id ?? null,
      pozoId: body.pozo_id ?? null,
      lineas: Array.isArray(body.lineas) ? body.lineas : [],
    },
    { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol }
  )

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ documento_id: resultado.documentoId, numero: resultado.numero }, { status: 201 })
}
