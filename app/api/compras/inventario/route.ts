import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { adminClient } from '@/lib/supabase/clients'
import { paginarRange } from '@/lib/bodega-reportes-query'


export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q         = searchParams.get('q')?.trim()
  const categoria = searchParams.get('categoria')
  const area      = searchParams.get('area')

  // Fix: hallazgo real (2026-11-23) — sin ningún filtro (carga inicial de
  // /compras/inventario), el SELECT sobre ~1257 productos reales quedaba
  // cortado en silencio a 1000 filas por el límite por defecto de PostgREST
  // (mismo patrón ya corregido 3 veces en el proyecto — DEF-HU-035-001,
  // stock-bajo-minimo/excel de HU-033, reemplazo-inventario/analizar de
  // HU-041 — nunca aplicado a este endpoint, el más antiguo y de mayor uso).
  const resultado = await paginarRange((desde, hasta) =>
    (() => {
      let query = adminClient()
        .from('inventario')
        // Spec: HU-027 CA-01 — expone las 5 columnas nuevas (bodega_id/categoria_id/
        // stock_minimo/stock_maximo/ultimo_conteo_fecha) junto a las ya existentes.
        // HU-041 CA-12 — expone `activo`; el listado administrativo muestra
        // ambos estados (a diferencia de search/search-interno, que solo activos).
        .select('id, codigo, descripcion, area, categoria, saldo_existencias, costo_unitario, locacion, marca, bodega_id, categoria_id, stock_minimo, stock_maximo, ultimo_conteo_fecha, activo, requiere_guia, unidad')
        .order('codigo')
        .range(desde, hasta)

      if (q)         query = query.or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%,marca.ilike.%${q}%`)
      if (categoria) query = query.eq('categoria', categoria)
      if (area)      query = query.eq('area', area)

      return query
    })()
  )
  return NextResponse.json(resultado)
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
      // Spec: HU-042 CA-01/CA-21 — indicador de guía y unidad de medida.
      requiere_guia, unidad,
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
        requiere_guia:      requiere_guia === false ? false : true,
        unidad:             unidad?.trim() ? unidad.trim().toUpperCase() : 'EA',
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
