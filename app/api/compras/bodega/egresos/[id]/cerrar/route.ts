import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionEgreso, cerrarDocumentoEgreso } from '@/lib/bodega-egreso'
import { emitirGuia } from '@/lib/bodega-guia'

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

  const actor = { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol }
  const resultado = await cerrarDocumentoEgreso(
    id,
    actor,
    { override: !!body.override, justificacion: body.justificacion }
  )

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.error, lineas_excedidas: resultado.lineasExcedidas ?? [] },
      { status: 400 }
    )
  }

  // Spec: HU-042 CA-04c — "Cerrar y generar guía": la guía se emite solo si el cierre
  // tuvo éxito. Si la emisión falla, el egreso queda cerrado, no se consume número y la
  // guía puede generarse luego desde el detalle (mismo patrón best-effort de HU-016/028/030).
  if (body.emitir_guia) {
    const guia = await emitirGuia(id, {}, actor)
    if (guia.ok) return NextResponse.json({ success: true, guia: { id: guia.guiaId, numero: guia.numero } })
    return NextResponse.json({ success: true, guia_error: guia.error })
  }

  return NextResponse.json({ success: true })
}
