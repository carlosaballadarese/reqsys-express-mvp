import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { puedeVerPrecioNP } from '@/lib/np-precio'
import ExcelJS from 'exceljs'

function usd(n: number | null | undefined) { return `$${Number(n ?? 0).toFixed(2)}` }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

const ROJO    = '7f1d1d'
const ROJO2   = '991b1b'
const BG_HDR  = 'fef2f2'

function headerStyle(bg = ROJO): Partial<ExcelJS.Style> {
  return {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bg}` } },
    font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border:    allBorder(),
  }
}
function cellStyle(bold = false, align: ExcelJS.Alignment['horizontal'] = 'left'): Partial<ExcelJS.Style> {
  return {
    font:      { bold, size: 9 },
    alignment: { horizontal: align, vertical: 'middle', wrapText: true },
    border:    allBorder(),
  }
}
function allBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFcbd5e1' } }
  return { top: s, bottom: s, left: s, right: s }
}

// Spec RN-01
function tieneAccesoExportacion(
  np: { creado_por_id: string | null; asignado_a: string | null },
  userId: string,
  rol: string
): boolean {
  if (['compras', 'admin'].includes(rol)) return true
  if (np.creado_por_id === userId) return true
  if (rol === 'asistente_compras' && np.asignado_a === userId) return true
  return false
}

const NP_SELECT = [
  'id, numero, area, clasificacion, prioridad, tipo_compra, centro_costo',
  'descripcion_general, created_at',
  'es_regularizacion, fecha_provision',
  'proveedor_regularizacion_nombre, proveedor_regularizacion_identificacion',
  'creado_por_id, solicitante_nombre, asignado_a',
  'aprobador_np_nombre, aprobador_np_area',
  'condiciones_minimas',
].join(', ')

// Columnas fijas A-K (11). H e I son precio; se dejan vacías cuando !mostrarPrecios
const LAST_COL = 'K'
const TOTAL_COLS = 11

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    const rol = perfil?.rol ?? ''

    const [{ data: np }, { data: items }, { data: config }] = await Promise.all([
      adminClient().from('notas_pedido').select(NP_SELECT).eq('id', id).single(),
      adminClient().from('items_np')
        .select('linea, tipo, codigo, descripcion, unidad, cantidad, precio_unitario, total_estimado, informacion_adicional, proveedor_sugerido, fecha_requerida')
        .eq('nota_pedido_id', id).order('linea'),
      adminClient().from('configuracion_empresa')
        .select('documento_numero_np, revision_np').eq('id', 1).single(),
    ])

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    if (!tieneAccesoExportacion(np, user.id, rol))
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const mostrarPrecios = puedeVerPrecioNP(rol, np.es_regularizacion ?? false, np.creado_por_id, user.id)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('NP')

    // Columnas A-K
    ws.columns = [
      { width: 6  },  // A: ITEM #
      { width: 8  },  // B: TIPO
      { width: 10 },  // C: CÓDIGO
      { width: 30 },  // D: DESCRIPCIÓN
      { width: 7  },  // E: UNIDAD
      { width: 7  },  // F: QTY
      { width: 20 },  // G: INFO ADICIONAL
      { width: 12 },  // H: P.UNIT (condicional)
      { width: 12 },  // I: P.TOTAL (condicional)
      { width: 12 },  // J: FECHA REQUERIDA
      { width: 18 },  // K: PROVEEDOR SUGERIDO
    ]

    let row = 1

    // Logo
    try {
      const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reqsys-express.vercel.app'
      const logoRes = await fetch(`${appUrl}/logo_arlift.png`)
      if (logoRes.ok) {
        const logoBuf = Buffer.from(await logoRes.arrayBuffer())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imgId   = wb.addImage({ buffer: logoBuf as any, extension: 'png' })
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 36 } })
      }
    } catch { /* logo no crítico */ }

    // Spec CA-04: Título
    ws.mergeCells(`B${row}:J${row}`)
    const titleCell = ws.getCell(`B${row}`)
    titleCell.value = 'NOTA DE PEDIDO'
    titleCell.style = {
      font:      { bold: true, size: 16, color: { argb: `FF${ROJO}` } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
    ws.getCell(`${LAST_COL}${row}`).value = `No. ${np.numero}`
    ws.getCell(`${LAST_COL}${row}`).style = {
      font:      { bold: true, size: 12, color: { argb: `FF${ROJO2}` } },
      alignment: { horizontal: 'right', vertical: 'middle' },
    }
    ws.getRow(row).height = 28
    row++

    // Spec CA-04: Info bar
    const infoData = [
      ['DOCUMENTO NÚMERO', config?.documento_numero_np ?? 'AL-L4-07-F01'],
      ['REVISIÓN',         String(config?.revision_np ?? 1)],
      ['FECHA EMISIÓN',    fmtDate(np.created_at)],
      ['AREA',             np.area],
      ['CLASIFICACIÓN',    np.clasificacion ?? 'Formatos, L4'],
    ]
    const infoCols = ['A', 'C', 'E', 'G', 'J']
    const infoValCols = ['B', 'D', 'F', 'H', 'K']
    infoData.forEach(([lbl, val], i) => {
      const lc = ws.getRow(row)
      const vc = ws.getRow(row + 1)
      lc.getCell(infoCols[i]).value = lbl
      lc.getCell(infoCols[i]).style = {
        font: { bold: true, size: 7, color: { argb: `FF${ROJO}` } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BG_HDR}` } },
        alignment: { horizontal: 'left' },
      }
      vc.getCell(infoCols[i]).value = val
      vc.getCell(infoCols[i]).style = {
        font: { size: 8 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BG_HDR}` } },
        alignment: { horizontal: 'left' },
        border: allBorder(),
      }
      // Merge valor con la siguiente col
      try { ws.mergeCells(`${infoCols[i]}${row + 1}:${infoValCols[i]}${row + 1}`) } catch { /* overlap */ }
    })
    ws.getRow(row).height = 12
    ws.getRow(row + 1).height = 14
    row += 2

    // Spec CA-05: INFORMACIÓN GENERAL
    ws.mergeCells(`A${row}:${LAST_COL}${row}`)
    ws.getCell(`A${row}`).value = 'INFORMACIÓN GENERAL'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    const infoGenRows: [string, string][] = [
      ['PRIORIDAD',     np.prioridad ?? '—'],
      ['TIPO:',         np.tipo_compra ?? ''],
      ['CENTRO DE COSTOS', np.centro_costo ?? ''],
      ['REGULARIZACIÓN:', `${np.es_regularizacion ? '☐' : '☑'} NO    ${np.es_regularizacion ? '☑' : '☐'} SÍ`],
      ['FECHA DE PROVISIÓN DEL BIEN O SERVICIO (SI LA RESPUESTA A REGULARIZACIÓN ES SÍ:)',
        np.es_regularizacion ? fmtDate(np.fecha_provision) : ''],
      ['INGRESAR PROVEEDOR EN CASO DE QUE LA RESPUESTA A REGULARIZACIÓN SEA SÍ:',
        np.es_regularizacion
          ? [np.proveedor_regularizacion_nombre, np.proveedor_regularizacion_identificacion].filter(Boolean).join(' — ')
          : ''],
    ]
    infoGenRows.forEach(([lbl, val]) => {
      ws.mergeCells(`A${row}:C${row}`)
      ws.getCell(`A${row}`).value = lbl
      ws.getCell(`A${row}`).style = { font: { bold: true, size: 8 }, alignment: { wrapText: true }, border: allBorder() }
      ws.mergeCells(`D${row}:${LAST_COL}${row}`)
      ws.getCell(`D${row}`).value = val
      ws.getCell(`D${row}`).style = { font: { size: 8 }, alignment: { wrapText: true }, border: allBorder() }
      ws.getRow(row).height = 16
      row++
    })

    // Spec CA-06: DESCRIPCIÓN GENERAL
    ws.mergeCells(`A${row}:${LAST_COL}${row}`)
    ws.getCell(`A${row}`).value = 'DESCRIPCION GENERAL'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    ws.mergeCells(`A${row}:${LAST_COL}${row + 1}`)
    ws.getCell(`A${row}`).value = np.descripcion_general ?? ''
    ws.getCell(`A${row}`).style = { font: { size: 8 }, alignment: { wrapText: true, vertical: 'top' }, border: allBorder() }
    ws.getRow(row).height = 30
    row += 2

    // Spec CA-07: Tabla de ítems
    ws.mergeCells(`A${row}:${LAST_COL}${row}`)
    ws.getCell(`A${row}`).value = 'ÍTEMS REQUERIDOS'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    // Cabecera tabla
    const thRow = ws.getRow(row)
    const allCols  = ['A','B','C','D','E','F','G','H','I','J','K']
    const allHdrs  = [
      'ITEM #', 'TIPO', 'CÓDIGO', 'DESCRIPCIÓN DEL BIEN O SERVICIO',
      'UNIDAD', 'QTY SOLIC.', 'INFORMACIÓN ADICIONAL',
      mostrarPrecios ? 'P. UNIT. (USD)' : '',
      mostrarPrecios ? 'P. TOTAL (USD)' : '',
      'FECHA REQUERIDA', 'PROVEEDOR SUGERIDO',
    ]
    allHdrs.forEach((h, i) => {
      thRow.getCell(allCols[i]).value = h
      thRow.getCell(allCols[i]).style = headerStyle(ROJO2)
    })
    thRow.height = 28
    row++

    // Filas ítems
    ;(items ?? []).forEach((it: any) => {
      const r = ws.getRow(row)
      r.getCell('A').value = it.linea
      r.getCell('A').style = cellStyle(false, 'center')
      r.getCell('B').value = it.tipo ?? ''
      r.getCell('B').style = cellStyle()
      r.getCell('C').value = it.codigo ?? ''
      r.getCell('C').style = cellStyle()
      r.getCell('D').value = it.descripcion
      r.getCell('D').style = cellStyle()
      r.getCell('E').value = it.unidad
      r.getCell('E').style = cellStyle(false, 'center')
      r.getCell('F').value = it.cantidad
      r.getCell('F').style = cellStyle(false, 'center')
      r.getCell('G').value = it.informacion_adicional ?? ''
      r.getCell('G').style = cellStyle()
      r.getCell('H').value = mostrarPrecios ? usd(it.precio_unitario) : ''
      r.getCell('H').style = cellStyle(false, 'right')
      r.getCell('I').value = mostrarPrecios ? usd(it.total_estimado) : ''
      r.getCell('I').style = cellStyle(false, 'right')
      r.getCell('J').value = fmtDate(it.fecha_requerida)
      r.getCell('J').style = cellStyle(false, 'center')
      r.getCell('K').value = it.proveedor_sugerido ?? ''
      r.getCell('K').style = cellStyle()
      r.height = 20
      row++
    })

    // Spec CA-08: Totales — solo si mostrarPrecios
    if (mostrarPrecios) {
      const totalSinIVA = (items ?? []).reduce((acc: number, it: any) => acc + Number(it.total_estimado ?? 0), 0)
      const iva         = totalSinIVA * 0.15
      const totalConIVA = totalSinIVA + iva
      const totalRows: [string, string][] = [
        ['VALOR TOTAL DEL REQUERIMIENTO (USD) — sin IVA:', usd(totalSinIVA)],
        ['IVA 15%:', usd(iva)],
        ['VALOR TOTAL CON IVA 15%:', usd(totalConIVA)],
      ]
      totalRows.forEach(([lbl, val]) => {
        ws.mergeCells(`A${row}:I${row}`)
        ws.getCell(`A${row}`).value = lbl
        ws.getCell(`A${row}`).style = { font: { bold: true, size: 9 }, alignment: { horizontal: 'right' }, border: allBorder() }
        ws.mergeCells(`J${row}:${LAST_COL}${row}`)
        ws.getCell(`J${row}`).value = val
        ws.getCell(`J${row}`).style = { font: { bold: true, size: 9, color: { argb: `FF${ROJO2}` } }, alignment: { horizontal: 'right' }, border: allBorder() }
        ws.getRow(row).height = 16
        row++
      })
    }

    // Spec CA-09: Condiciones mínimas
    row++
    ws.mergeCells(`A${row}:${LAST_COL}${row}`)
    ws.getCell(`A${row}`).value = 'CONDICIONES MÍNIMAS PARA PROVEEDORES (certificaciones, normas, fichas técnicas, etc.)'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    ws.mergeCells(`A${row}:${LAST_COL}${row + 2}`)
    ws.getCell(`A${row}`).value = np.condiciones_minimas ?? ''
    ws.getCell(`A${row}`).style = { font: { size: 8 }, alignment: { wrapText: true, vertical: 'top' }, border: allBorder() }
    ws.getRow(row).height = 50
    row += 3

    // Spec CA-10: Aprobaciones
    ws.mergeCells(`A${row}:${LAST_COL}${row}`)
    ws.getCell(`A${row}`).value = 'APROBACIONES'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 14
    row++

    // Cabeceras: ELABORADO POR | APROBADO POR
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(`A${row}`).value = 'ELABORADO POR'
    ws.getCell(`A${row}`).style = headerStyle(ROJO2)
    ws.mergeCells(`F${row}:${LAST_COL}${row}`)
    ws.getCell(`F${row}`).value = 'APROBADO POR'
    ws.getCell(`F${row}`).style = headerStyle(ROJO2)
    ws.getRow(row).height = 14
    row++

    // Área y nombre
    ws.mergeCells(`A${row}:B${row}`)
    ws.getCell(`A${row}`).value = 'Área:'
    ws.getCell(`A${row}`).style = cellStyle(true)
    ws.mergeCells(`C${row}:E${row}`)
    ws.getCell(`C${row}`).value = np.area
    ws.getCell(`C${row}`).style = cellStyle()
    ws.mergeCells(`F${row}:G${row}`)
    ws.getCell(`F${row}`).value = 'Área:'
    ws.getCell(`F${row}`).style = cellStyle(true)
    ws.mergeCells(`H${row}:${LAST_COL}${row}`)
    ws.getCell(`H${row}`).value = np.aprobador_np_area ?? ''
    ws.getCell(`H${row}`).style = cellStyle()
    ws.getRow(row).height = 14
    row++

    ws.mergeCells(`A${row}:B${row}`)
    ws.getCell(`A${row}`).value = 'Nombre:'
    ws.getCell(`A${row}`).style = cellStyle(true)
    ws.mergeCells(`C${row}:E${row}`)
    ws.getCell(`C${row}`).value = np.solicitante_nombre
    ws.getCell(`C${row}`).style = cellStyle()
    ws.mergeCells(`F${row}:G${row}`)
    ws.getCell(`F${row}`).value = 'Nombre:'
    ws.getCell(`F${row}`).style = cellStyle(true)
    ws.mergeCells(`H${row}:${LAST_COL}${row}`)
    ws.getCell(`H${row}`).value = np.aprobador_np_nombre ?? ''
    ws.getCell(`H${row}`).style = cellStyle()
    ws.getRow(row).height = 14
    row++

    // Firma
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(`A${row}`).value = 'Firma / Fecha: _______________'
    ws.getCell(`A${row}`).style = { font: { size: 7, color: { argb: 'FF94a3b8' } }, alignment: { vertical: 'bottom' }, border: allBorder() }
    ws.mergeCells(`F${row}:${LAST_COL}${row}`)
    ws.getCell(`F${row}`).value = 'Firma / Fecha: _______________'
    ws.getCell(`F${row}`).style = { font: { size: 7, color: { argb: 'FF94a3b8' } }, alignment: { vertical: 'bottom' }, border: allBorder() }
    ws.getRow(row).height = 30

    // Spec CA-11: nombre de archivo
    const area   = (np.area ?? 'NP').toUpperCase().replace(/[^A-Z0-9]/g, '-')
    const nombre = `NP_${np.numero}_${area}`

    const rawBuffer = await wb.xlsx.writeBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([rawBuffer as any]), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('NP Excel error:', err)
    return NextResponse.json({ error: 'Error al generar Excel' }, { status: 500 })
  }
}
