import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionIngreso, generarRecepcionAdicionalOC } from '@/lib/bodega-ingreso'

// Spec: HU-047 CA-02 — genera un Documento de Ingreso adicional para una OC
// que ya tuvo al menos una recepción (típicamente la automática al aprobar).
// Mismos roles que el resto de Documentos de Ingreso de Bodega.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionIngreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params
  const body = await req.json()
  const lineas = Array.isArray(body.lineas) ? body.lineas : []
  const bodegaId = typeof body.bodega_id === 'string' && body.bodega_id ? body.bodega_id : null

  const resultado = await generarRecepcionAdicionalOC(id, lineas, {
    id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol,
  }, bodegaId)

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 400 })
  }

  return NextResponse.json({ documento_id: resultado.documentoId, numero: resultado.numero }, { status: 201 })
}
