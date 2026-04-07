import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await adminClient()
    .from('proveedores')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body   = await req.json()
    const { nombre, clasificacion, categoria, ciudad, direccion, telefono, email, contacto, activo } = body

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('proveedores')
      .update({
        nombre:        nombre.trim(),
        clasificacion: clasificacion || null,
        categoria:     categoria     || null,
        ciudad:        ciudad        || null,
        direccion:     direccion     || null,
        telefono:      telefono      || null,
        email:         email?.toLowerCase() || null,
        contacto:      contacto      || null,
        activo:        activo !== false,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'editar_proveedor',
      entidad:    'proveedor',
      entidad_id: id,
      referencia: nombre.trim(),
      detalle:    { clasificacion, categoria, activo: activo !== false },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
