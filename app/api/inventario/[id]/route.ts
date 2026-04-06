import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('inventario')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body   = await req.json()
    const {
      codigo, descripcion, area, categoria,
      saldo_existencias, costo_unitario,
      locacion, codigo_origen, descripcion_origen, marca,
    } = body

    if (!codigo || !descripcion) {
      return NextResponse.json({ error: 'codigo y descripcion son requeridos' }, { status: 400 })
    }

    // Verificar que el código no esté tomado por otro ítem
    const { data: existente } = await supabaseAdmin
      .from('inventario')
      .select('id')
      .eq('codigo', codigo)
      .neq('id', id)
      .single()

    if (existente) {
      return NextResponse.json({ error: `El código ${codigo} ya está en uso por otro ítem` }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from('inventario')
      .update({
        codigo,
        descripcion:        descripcion.trim(),
        area:               area               || null,
        categoria:          categoria?.trim()  || null,
        saldo_existencias:  Number(saldo_existencias)  || 0,
        costo_unitario:     Number(costo_unitario)     || 0,
        locacion:           locacion?.trim()           || null,
        codigo_origen:      codigo_origen?.trim()      || null,
        descripcion_origen: descripcion_origen?.trim() || null,
        marca:              marca?.trim()              || null,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
