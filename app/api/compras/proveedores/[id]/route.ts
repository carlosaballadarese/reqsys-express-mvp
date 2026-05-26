import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { validarRucEcuador } from '@/lib/validators'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

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
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || !['compras', 'admin', 'asistente_compras'].includes(perfil.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params
    const body   = await req.json()
    const { nombre, ruc, clasificacion, categoria, ciudad, giro_negocio, direccion, telefono, email, contacto, activo } = body

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    if (ruc?.trim() && !validarRucEcuador(ruc.trim())) {
      return NextResponse.json({ error: 'El RUC no tiene un formato válido (13 dígitos, provincia 01-24)' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('proveedores')
      .update({
        nombre:        nombre.trim(),
        ruc:           ruc?.trim()         || null,
        clasificacion: clasificacion        || null,
        categoria:     categoria            || null,
        ciudad:        ciudad               || null,
        giro_negocio:  giro_negocio         || null,
        direccion:     direccion            || null,
        telefono:      telefono             || null,
        email:         email?.toLowerCase() || null,
        contacto:      contacto             || null,
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
