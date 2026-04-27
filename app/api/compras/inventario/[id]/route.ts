import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await adminClient()
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
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const { id } = await params
    const body   = await req.json()
    const {
      codigo, descripcion, area, categoria,
      saldo_existencias, costo_unitario,
      locacion, codigo_origen, descripcion_origen, marca, observaciones,
    } = body

    if (!codigo || !descripcion) {
      return NextResponse.json({ error: 'codigo y descripcion son requeridos' }, { status: 400 })
    }

    // Verificar que el código no esté tomado por otro ítem
    const { data: existente } = await adminClient()
      .from('inventario')
      .select('id')
      .eq('codigo', codigo)
      .neq('id', id)
      .single()

    if (existente) {
      return NextResponse.json({ error: `El código ${codigo} ya está en uso por otro ítem` }, { status: 409 })
    }

    const { error } = await adminClient()
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
        observaciones:      observaciones?.trim()      || null,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'editar_item_inventario',
      entidad:    'inventario',
      entidad_id: id,
      referencia: `${codigo} — ${descripcion.trim()}`,
      detalle:    { area, categoria, saldo_existencias: Number(saldo_existencias) || 0 },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
