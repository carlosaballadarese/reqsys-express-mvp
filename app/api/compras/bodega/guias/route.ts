import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionGuia } from '@/lib/bodega-guia'
import { paginarRange } from '@/lib/bodega-reportes-query'

// Spec: HU-042 CA-18 — listado de guías con filtros (número, fechas, destinatario, transportista, estado).
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  const sp = new URL(req.url).searchParams
  const numero = sp.get('numero')?.replace(/\D/g, '')
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const destinatario = sp.get('destinatario')?.trim()
  const transportista = sp.get('transportista')?.trim()
  const estado = sp.get('estado')

  const filas = await paginarRange<Record<string, unknown>>((a, b) => {
    let q = adminClient()
      .from('guias_remision')
      .select('id, numero, serie, estado, documento_egreso_id, fecha_inicio_traslado, motivo, destinatario_nombre, transportista_nombre, placa, created_at')
      .order('numero', { ascending: false })
      .range(a, b)
    if (numero) q = q.eq('numero', Number(numero))
    if (desde) q = q.gte('fecha_inicio_traslado', desde)
    if (hasta) q = q.lte('fecha_inicio_traslado', hasta)
    if (destinatario) q = q.ilike('destinatario_nombre', `%${destinatario}%`)
    if (transportista) q = q.ilike('transportista_nombre', `%${transportista}%`)
    if (estado === 'emitida' || estado === 'anulada') q = q.eq('estado', estado)
    return q as unknown as PromiseLike<{ data: Record<string, unknown>[] | null }>
  })

  return NextResponse.json(filas)
}
