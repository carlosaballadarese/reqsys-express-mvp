import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionIngreso, crearDocumentoIngresoManual } from '@/lib/bodega-ingreso'

// Spec: HU-028 CA-02/CA-03, HU-029 CA-05 — listado de Documentos de Ingreso,
// incluye tipo_movimiento para distinguir Compra/Devolución/Reconteo.
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
    .select('id, numero, bodega_id, estado, tipo_movimiento, registro_compras_id, created_at, cerrado_en')
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Spec: HU-029 CA-01 — creación manual (Devolución/Reconteo), sin OC de origen.
export async function POST(req: NextRequest) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const body = await req.json()
  const resultado = await crearDocumentoIngresoManual(
    {
      tipoMovimiento: body.tipo_movimiento,
      bodegaId: body.bodega_id ?? null,
      lineas: Array.isArray(body.lineas) ? body.lineas : [],
      egresoPrestamoId: body.egreso_prestamo_id ?? null,
    },
    { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol }
  )

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ documento_id: resultado.documentoId, numero: resultado.numero }, { status: 201 })
}
