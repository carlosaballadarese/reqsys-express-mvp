import { NextRequest, NextResponse } from 'next/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q         = searchParams.get('q')?.trim()
  const categoria = searchParams.get('categoria')
  const area      = searchParams.get('area')

  let query = adminClient()
    .from('inventario')
    .select('id, codigo, descripcion, area, categoria, saldo_existencias, costo_unitario, locacion, marca')
    .order('codigo')

  if (q)         query = query.or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%,marca.ilike.%${q}%`)
  if (categoria) query = query.eq('categoria', categoria)
  if (area)      query = query.eq('area', area)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      codigo, descripcion, area, categoria,
      saldo_existencias, costo_unitario,
      locacion, codigo_origen, descripcion_origen, marca,
    } = body

    if (!codigo || !descripcion) {
      return NextResponse.json({ error: 'codigo y descripcion son requeridos' }, { status: 400 })
    }

    const { data: existe } = await adminClient()
      .from('inventario')
      .select('id')
      .eq('codigo', codigo)
      .single()

    if (existe) {
      return NextResponse.json({ error: `El código ${codigo} ya existe en inventario` }, { status: 409 })
    }

    const { data, error } = await adminClient()
      .from('inventario')
      .insert({
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
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'crear_item_inventario',
      entidad:    'inventario',
      entidad_id: data.id,
      referencia: `${data.codigo} — ${data.descripcion}`,
      detalle:    { area, categoria, saldo_existencias: Number(saldo_existencias) || 0 },
    })

    return NextResponse.json({ success: true, item: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
