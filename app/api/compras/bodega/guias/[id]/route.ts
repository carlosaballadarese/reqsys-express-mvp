import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionGuia } from '@/lib/bodega-guia'

// Spec: HU-042 CA-18 — detalle de una guía con sus líneas y el egreso de origen.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  const { id } = await params
  const { data: guia } = await adminClient().from('guias_remision').select('*').eq('id', id).single()
  if (!guia) return NextResponse.json({ error: 'Guía no encontrada' }, { status: 404 })

  const [{ data: items }, { data: egreso }] = await Promise.all([
    adminClient().from('guias_remision_items')
      .select('id, linea, codigo, descripcion, unidad, cantidad').eq('guia_id', id).order('linea'),
    adminClient().from('documentos_egreso').select('id, numero, tipo').eq('id', guia.documento_egreso_id).single(),
  ])

  return NextResponse.json({ ...guia, items: items ?? [], egreso: egreso ?? null })
}
