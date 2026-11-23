import { NextResponse } from 'next/server'
import { verificarAutorizacionEgreso, listarPrestamosPendientes } from '@/lib/bodega-egreso'

// Spec: HU-030 CA-05 — Préstamos cerrados sin ninguna Devolución cerrada que los referencie.
export async function GET() {
  const auth = await verificarAutorizacionEgreso()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: auth.status }
    )
  }

  const pendientes = await listarPrestamosPendientes()
  return NextResponse.json(pendientes)
}
