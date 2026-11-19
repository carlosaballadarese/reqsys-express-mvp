import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'


export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q         = searchParams.get('q')?.trim()
  const categoria = searchParams.get('categoria')
  const area      = searchParams.get('area')

  let query = adminClient()
    .from('inventario')
    // Spec: HU-027 CA-01 — expone las 5 columnas nuevas (bodega_id/categoria_id/
    // stock_minimo/stock_maximo/ultimo_conteo_fecha) junto a las ya existentes.
    .select('id, codigo, descripcion, area, categoria, saldo_existencias, costo_unitario, locacion, marca, bodega_id, categoria_id, stock_minimo, stock_maximo, ultimo_conteo_fecha')
    .order('codigo')

  if (q)         query = query.or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%,marca.ilike.%${q}%`)
  if (categoria) query = query.eq('categoria', categoria)
  if (area)      query = query.eq('area', area)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      codigo, descripcion, area, categoria,
      locacion, codigo_origen, descripcion_origen, marca, observaciones,
      bodega_id, categoria_id, stock_minimo, stock_maximo,
      // Spec: HU-027 CA-04/CA-05 — `costo_unitario`/`saldo_existencias` ya NO se
      // aceptan del body; si el cliente los envía, se ignoran silenciosamente
      // (nunca fue un error del cliente, el campo simplemente dejó de tener
      // efecto). Siempre se insertan en 0 — solo cambian vía Kardex (HU-028).
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
        saldo_existencias:  0,
        costo_unitario:     0,
        locacion:           locacion?.trim()           || null,
        codigo_origen:      codigo_origen?.trim()      || null,
        descripcion_origen: descripcion_origen?.trim() || null,
        marca:              marca?.trim()              || null,
        observaciones:      observaciones?.trim()      || null,
        bodega_id:          bodega_id    || null,
        categoria_id:       categoria_id || null,
        stock_minimo:       stock_minimo != null && stock_minimo !== '' ? Number(stock_minimo) : null,
        stock_maximo:       stock_maximo != null && stock_maximo !== '' ? Number(stock_maximo) : null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'crear_item_inventario',
      entidad:    'inventario',
      entidad_id: data.id,
      referencia: `${data.codigo} — ${data.descripcion}`,
      detalle:    { area, categoria, bodega_id, categoria_id },
    })

    return NextResponse.json({ success: true, item: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
