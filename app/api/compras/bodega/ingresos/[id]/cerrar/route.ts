import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionIngreso, cerrarDocumentoIngreso } from '@/lib/bodega-ingreso'

// Spec: HU-028 CA-04/CA-05 — cierre del Documento de Ingreso, genera Kardex.
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

  const resultado = await cerrarDocumentoIngreso(id, {
    id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol,
  })

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.error, lineas_invalidas: resultado.lineasInvalidas ?? [] },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
