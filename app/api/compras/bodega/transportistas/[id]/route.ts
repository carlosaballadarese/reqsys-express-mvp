import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { verificarAutorizacionGuia } from '@/lib/bodega-guia'

// Spec: HU-042 CA-11 — edición y desactivación (sin DELETE físico, mismo criterio de HU-026).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const { nombre, identificacion, placa, activo } = await req.json()
    const update: { nombre?: string; identificacion?: string; placa?: string | null; activo?: boolean } = {}

    if (typeof nombre === 'string') {
      if (!nombre.trim()) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      update.nombre = nombre.trim()
    }
    if (identificacion !== undefined) {
      const idLimpia = identificacion?.toString().trim()
      if (!idLimpia) return NextResponse.json({ error: 'La cédula/RUC no puede quedar vacía' }, { status: 400 })
      update.identificacion = idLimpia
    }
    if (placa !== undefined) update.placa = placa?.trim()?.toUpperCase() || null
    if (typeof activo === 'boolean') update.activo = activo
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

    const { data, error } = await adminClient().from('transportistas').update(update).eq('id', id)
      .select('id, nombre, identificacion, placa, activo').single()
    if (error || !data) return NextResponse.json({ error: 'Transportista no encontrado' }, { status: 404 })

    await registrarAuditoria({
      accion: 'editar_transportista', entidad: 'transportista', entidad_id: id,
      referencia: data.nombre, detalle: { ...update, actor_rol: auth.rol },
    })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
