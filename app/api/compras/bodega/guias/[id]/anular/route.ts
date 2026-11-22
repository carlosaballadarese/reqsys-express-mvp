import { NextRequest, NextResponse } from 'next/server'
import { verificarAutorizacionGuia, anularGuia } from '@/lib/bodega-guia'

// Spec: HU-042 CA-16/CA-20 — la anulación se restringe a compras/admin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })
  if (!['compras', 'admin'].includes(auth.rol)) {
    return NextResponse.json({ error: 'Solo compras o admin pueden anular una guía' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const r = await anularGuia(id, body.motivo ?? '', { id: auth.userId, nombre: auth.nombre, email: auth.email, rol: auth.rol })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ success: true })
}
