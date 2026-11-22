import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionGuia } from '@/lib/bodega-guia'

// Spec: HU-042 CA-11/CA-20 — catálogo de Transportistas (bodega/compras/admin).
export async function GET(req: NextRequest) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  const todas = new URL(req.url).searchParams.get('todas') === '1'
  let query = adminClient().from('transportistas').select('id, nombre, identificacion, placa, activo').order('nombre')
  if (!todas) query = query.eq('activo', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { nombre, identificacion, placa } = await req.json()
    const nombreLimpio = nombre?.trim()
    const idLimpia = identificacion?.toString().trim()
    if (!nombreLimpio) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    if (!idLimpia) return NextResponse.json({ error: 'La cédula/RUC es requerida' }, { status: 400 })

    // La identificación se guarda como texto (conserva el cero inicial de la cédula).
    const { data, error } = await adminClient()
      .from('transportistas')
      .insert({ nombre: nombreLimpio, identificacion: idLimpia, placa: placa?.trim()?.toUpperCase() || null })
      .select('id, nombre, identificacion, placa, activo')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion: 'crear_transportista', entidad: 'transportista', entidad_id: data.id,
      referencia: data.nombre, detalle: { actor_rol: auth.rol },
    })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
