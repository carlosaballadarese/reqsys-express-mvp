import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionEnsamblaje, confirmarOrdenEnsamblaje } from '@/lib/bodega-ensamblaje'

// Spec: HU-031 CA-02/CA-03/CA-04 — confirmación de la Orden de Ensamblaje.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAutorizacionEnsamblaje()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const { id } = await params
  const resultado = await confirmarOrdenEnsamblaje(id, {
    id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol,
  })

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.error, insumos_excedidos: resultado.insumosExcedidos ?? [] },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
