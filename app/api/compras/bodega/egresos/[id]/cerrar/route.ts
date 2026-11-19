import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionEgreso, cerrarDocumentoEgreso } from '@/lib/bodega-egreso'

// Spec: HU-030 CA-02/CA-03/CA-06 — cierre del Documento de Egreso, genera Kardex.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEgreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const resultado = await cerrarDocumentoEgreso(
    id,
    { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol },
    { override: !!body.override, justificacion: body.justificacion }
  )

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.error, lineas_excedidas: resultado.lineasExcedidas ?? [] },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
