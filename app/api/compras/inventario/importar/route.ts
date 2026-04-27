import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
// @ts-ignore — xlsx ships its own types
import * as XLSX from 'xlsx'

// Normaliza un encabezado: sin acentos, sin saltos de línea,
// espacios colapsados, sin puntuación extra, minúsculas
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // eliminar diacríticos
    .replace(/[\r\n\t]+/g, ' ')       // saltos de línea → espacio
    .replace(/\s+/g, ' ')             // espacios múltiples → uno
    .replace(/[^\w\s]/g, '')          // eliminar puntuación (punto, coma, etc.)
    .toLowerCase()
    .trim()
}

// Mapeo normalizado → columna de BD
// Cada clave es la forma normalizada del encabezado en el Excel.
// Se incluyen variantes con/sin artículo, singular/plural, abreviaturas.
const HEADER_MAP: Record<string, string> = {
  // Código
  'codigo':                    'codigo',
  'cod':                       'codigo',
  // Descripción Artículo
  'descripcion articulo':      'descripcion',
  'descripcion del articulo':  'descripcion',
  'descripcion':               'descripcion',
  'articulo':                  'descripcion',
  // Área
  'area':                      'area',
  // Categoría
  'categoria':                 'categoria',
  'categorias':                'categoria',
  // Saldo Existencias
  'saldo existencias':         'saldo_existencias',
  'saldo de existencias':      'saldo_existencias',
  'saldo':                     'saldo_existencias',
  'existencias':               'saldo_existencias',
  'stock':                     'saldo_existencias',
  // Costo Unitario
  'costo unitario':            'costo_unitario',
  'costo':                     'costo_unitario',
  'precio unitario':           'costo_unitario',
  'precio':                    'costo_unitario',
  // Locación
  'locacion':                  'locacion',
  'ubicacion':                 'locacion',
  // Código de Origen
  'codigo de origen':          'codigo_origen',
  'cod de origen':             'codigo_origen',
  'codigo origen':             'codigo_origen',
  'cod origen':                'codigo_origen',
  // Descripción de Origen
  'descripcion de origen':     'descripcion_origen',
  'desc de origen':            'descripcion_origen',
  'descripcion origen':        'descripcion_origen',
  // Marca
  'marca':                     'marca',
  // Observaciones
  'observaciones':             'observaciones',
  'obs':                       'observaciones',
  'notas':                     'observaciones',
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx o .xls' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const sheetName = 'PRODUCTOS'
    if (!wb.SheetNames.includes(sheetName)) {
      return NextResponse.json({ error: `El archivo no contiene la hoja "${sheetName}"` }, { status: 400 })
    }

    const ws = wb.Sheets[sheetName]

    // Encabezados en fila 8 (índice 7), datos desde fila 9
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    // Fila 8 = índice 7 (0-based)
    const headerRow = raw[7] as (string | null)[]
    if (!headerRow) {
      return NextResponse.json({ error: 'No se encontró la fila de encabezados (fila 8)' }, { status: 400 })
    }

    // Mapear índice de columna → campo de BD (comparación normalizada)
    const colMap: Record<number, string> = {}
    headerRow.forEach((cell, idx) => {
      const header = norm(String(cell ?? ''))
      if (HEADER_MAP[header]) colMap[idx] = HEADER_MAP[header]
    })

    if (!Object.values(colMap).includes('codigo')) {
      return NextResponse.json({ error: 'No se encontró la columna "Código" en la fila 8' }, { status: 400 })
    }

    // Construir registros desde fila 9 en adelante (índice 8+)
    const registros: Record<string, unknown>[] = []
    for (let i = 8; i < raw.length; i++) {
      const row = raw[i] as (unknown)[]
      if (!row) continue

      const item: Record<string, unknown> = {}
      Object.entries(colMap).forEach(([colIdx, field]) => {
        item[field] = row[Number(colIdx)] ?? null
      })

      const codigo = String(item.codigo ?? '').trim()
      if (!codigo || !item.descripcion) continue  // saltar filas vacías

      registros.push({
        codigo,
        descripcion:        String(item.descripcion ?? '').trim()       || null,
        area:               item.area        ? String(item.area).trim()               : null,
        categoria:          item.categoria   ? String(item.categoria).trim()          : null,
        saldo_existencias:  item.saldo_existencias != null ? Number(item.saldo_existencias) || 0 : 0,
        costo_unitario:     item.costo_unitario != null    ? Number(item.costo_unitario)    || 0 : 0,
        locacion:           item.locacion    ? String(item.locacion).trim()           : null,
        codigo_origen:      item.codigo_origen    ? String(item.codigo_origen).trim()    : null,
        descripcion_origen: item.descripcion_origen ? String(item.descripcion_origen).trim() : null,
        marca:              item.marca       ? String(item.marca).trim()              : null,
        observaciones:      item.observaciones ? String(item.observaciones).trim()   : null,
      })
    }

    if (registros.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene registros válidos' }, { status: 400 })
    }

    // UPSERT por codigo — Supabase ignoreSingle no existe; usamos onConflict
    const BATCH = 200
    let insertados = 0
    let actualizados = 0
    const errores: string[] = []

    for (let i = 0; i < registros.length; i += BATCH) {
      const lote = registros.slice(i, i + BATCH)

      // Obtener códigos existentes del lote para saber si son insert o update
      const codigos = lote.map(r => r.codigo as string)
      const { data: existentes } = await adminClient()
        .from('inventario')
        .select('codigo')
        .in('codigo', codigos)

      const codigosExistentes = new Set((existentes ?? []).map(e => e.codigo))

      const { error } = await adminClient()
        .from('inventario')
        .upsert(lote, { onConflict: 'codigo' })

      if (error) {
        errores.push(`Lote ${i / BATCH + 1}: ${error.message}`)
      } else {
        lote.forEach(r => {
          if (codigosExistentes.has(r.codigo as string)) actualizados++
          else insertados++
        })
      }
    }

    return NextResponse.json({
      success: true,
      total:       registros.length,
      insertados,
      actualizados,
      errores,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al procesar el archivo' }, { status: 500 })
  }
}
