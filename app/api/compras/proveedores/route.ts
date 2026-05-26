import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { validarRucEcuador } from '@/lib/validators'


export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q             = searchParams.get('q')?.trim()
  const clasificacion = searchParams.get('clasificacion')
  const soloActivos   = searchParams.get('activo') !== 'false'

  if (q && q.length < 2) return NextResponse.json([])

  let query = adminClient()
    .from('proveedores')
    .select('id, nombre, ruc, clasificacion, categoria, ciudad, giro_negocio, direccion, telefono, email, contacto, activo')
    .order('nombre')

  if (q) query = query.or(`nombre.ilike.%${q}%,categoria.ilike.%${q}%,contacto.ilike.%${q}%`)
  if (clasificacion && clasificacion !== 'todas') query = query.eq('clasificacion', clasificacion)
  if (soloActivos) query = query.eq('activo', true)
  if (q) query = query.limit(10)

  const { data, error } = await query
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
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
    const body = await req.json()
    const { nombre, ruc, clasificacion, categoria, ciudad, giro_negocio, direccion, telefono, email, contacto } = body

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    if (ruc?.trim() && !validarRucEcuador(ruc.trim())) {
      return NextResponse.json({ error: 'El RUC no tiene un formato válido (13 dígitos, provincia 01-24)' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('proveedores')
      .insert({
        nombre:        nombre.trim(),
        ruc:           ruc?.trim()        || null,
        clasificacion: clasificacion       || null,
        categoria:     categoria           || null,
        ciudad:        ciudad              || null,
        giro_negocio:  giro_negocio        || null,
        direccion:     direccion           || null,
        telefono:      telefono            || null,
        email:         email?.toLowerCase() || null,
        contacto:      contacto            || null,
        activo:        true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'crear_proveedor',
      entidad:    'proveedor',
      entidad_id: data.id,
      referencia: data.nombre,
      detalle:    { clasificacion, categoria, ciudad },
    })

    return NextResponse.json({ success: true, proveedor: data })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
