import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q              = searchParams.get('q')?.trim()
  const clasificacion  = searchParams.get('clasificacion')
  const soloActivos    = searchParams.get('activo') !== 'false'

  // Búsqueda rápida para autocomplete (q corto)
  if (q && q.length < 2) return NextResponse.json([])

  let query = supabaseAdmin
    .from('proveedores')
    .select('id, nombre, clasificacion, categoria, ciudad, telefono, email, contacto, activo, direccion')
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
  try {
    const body = await req.json()
    const { nombre, clasificacion, categoria, ciudad, direccion, telefono, email, contacto } = body

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('proveedores')
      .insert({
        nombre:       nombre.trim(),
        clasificacion: clasificacion || null,
        categoria:    categoria    || null,
        ciudad:       ciudad       || null,
        direccion:    direccion    || null,
        telefono:     telefono     || null,
        email:        email?.toLowerCase() || null,
        contacto:     contacto     || null,
        activo:       true,
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
