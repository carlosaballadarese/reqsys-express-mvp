import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

function usd(n: number) { return `$${Number(n).toFixed(2)}` }
function fmtDate(s: string | null) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

const TEAL   = '0d2e2e'
const TEAL2  = '1a5252'
const DORADO = 'c9a840'
const BG_HDR = 'f1f5f9'

function headerStyle(bg = TEAL): Partial<ExcelJS.Style> {
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const [{ data: oc }, { data: items }, { data: empresa }] = await Promise.all([
      adminClient().from('registro_compras').select('*').eq('id', id).single(),
      adminClient().from('items_oc').select('*').eq('registro_compras_id', id).order('linea'),
      adminClient().from('configuracion_empresa').select('*').eq('id', 1).single(),
    ])

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (oc.estado_oc !== 'aprobada')
      return NextResponse.json({ error: 'Solo se puede exportar OCs aprobadas' }, { status: 400 })

    let creadorCargo = 'Compras'
    if (oc.creado_por_id) {
      const { data: perfil } = await adminClient()
        .from('perfiles').select('rol').eq('id', oc.creado_por_id).single()
      if (perfil?.rol === 'asistente_compras') creadorCargo = 'Asistente de Compras'
      else if (perfil?.rol === 'admin')        creadorCargo = 'Administrador'
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('OC')

    // Anchos de columna: A..J (10 cols)
    ws.columns = [
      { width: 6  },  // A: ITEM #
      { width: 10 },  // B: TIPO
      { width: 12 },  // C: CÓDIGO
      { width: 32 },  // D: DESCRIPCIÓN
      { width: 8  },  // E: UNIDAD
      { width: 8  },  // F: QTY
      { width: 22 },  // G: INFO ADICIONAL
      { width: 13 },  // H: P.UNIT
      { width: 13 },  // I: TOTAL
      { width: 13 },  // J: FECHA ENTREGA
    ]

    let row = 1

    // ── Título ──────────────────────────────────────────────────────────────
    ws.mergeCells(`A${row}:I${row}`)
    const titleCell = ws.getCell(`A${row}`)
    titleCell.value = 'ORDEN DE COMPRA'
    titleCell.style = {
      font:      { bold: true, size: 16, color: { argb: `FF${TEAL}` } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
    ws.getCell(`J${row}`).value = `No. ${oc.numero_oc}`
    ws.getCell(`J${row}`).style = {
      font:      { bold: true, size: 12, color: { argb: `FF${TEAL2}` } },
      alignment: { horizontal: 'right', vertical: 'middle' },
    }
    ws.getRow(row).height = 28
    row++

    // ── Info bar ────────────────────────────────────────────────────────────
    const infoData = [
      ['DOCUMENTO NUMERO', empresa?.documento_numero_oc ?? 'AL-L4-07-F01'],
      ['REVISIÓN', String(empresa?.revision_oc ?? 1)],
      ['FECHA EMISIÓN', fmtDate(oc.fecha_oc ?? oc.created_at)],
      ['PREPARADO POR', oc.creado_por_nombre ?? '—'],
      ['APROBADO POR', oc.aprobado_por_nombre ?? '—'],
      ['CLASIFICACIÓN', 'Formatos, L4'],
    ]
    // Labels row
    const labelRow = ws.getRow(row)
    const valRow   = ws.getRow(row + 1)
    infoData.forEach(([lbl, val], i) => {
      const cols = ['A', 'B', 'C', 'D', 'E', 'J']
      const col = cols[i]
      labelRow.getCell(col).value = lbl
      labelRow.getCell(col).style = {
        font:      { bold: true, size: 7, color: { argb: `FF${TEAL}` } },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BG_HDR}` } },
        alignment: { horizontal: 'left' },
      }
      valRow.getCell(col).value = val
      valRow.getCell(col).style = {
        font:      { size: 8 },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BG_HDR}` } },
        alignment: { horizontal: 'left' },
      }
    })
    ws.getRow(row).height = 14
    ws.getRow(row + 1).height = 14
    row += 2

    // ── Sección: INFORMACIÓN GENERAL ────────────────────────────────────────
    ws.mergeCells(`A${row}:J${row}`)
    ws.getCell(`A${row}`).value = 'INFORMACIÓN GENERAL'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    // Cabeceras bloque proveedor / facturar a
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(`A${row}`).value  = 'PROVEEDOR'
    ws.getCell(`A${row}`).style  = headerStyle(TEAL2)
    ws.mergeCells(`F${row}:J${row}`)
    ws.getCell(`F${row}`).value  = 'FACTURAR A'
    ws.getCell(`F${row}`).style  = headerStyle(TEAL2)
    ws.getRow(row).height = 14
    row++

    const provRows = [
      ['', oc.proveedor],
      ['RUC:', oc.proveedor_ruc],
      ['DIRECCIÓN:', oc.proveedor_direccion],
      ['CONTACTO:', oc.proveedor_contacto],
      ['TELÉFONO:', oc.proveedor_telefono],
      ['MAIL:', oc.proveedor_email],
    ]
    const empRows = [
      ['', empresa?.razon_social],
      ['RUC:', empresa?.ruc],
      ['DIRECCIÓN:', empresa?.direccion],
      ['CONTACTO:', empresa?.contacto],
      ['TELÉFONO:', empresa?.telefono],
      ['MAIL:', empresa?.email],
    ]
    provRows.forEach(([lbl, val], i) => {
      const r = ws.getRow(row + i)
      ws.mergeCells(`A${row + i}:B${row + i}`)
      r.getCell('A').value = lbl
      r.getCell('A').style = { font: { bold: true, size: 8 }, border: allBorder() }
      ws.mergeCells(`C${row + i}:E${row + i}`)
      r.getCell('C').value = val ?? '—'
      r.getCell('C').style = { font: { size: 8 }, border: allBorder() }
      // Empresa
      r.getCell('F').value = empRows[i][0]
      r.getCell('F').style = { font: { bold: true, size: 8 }, border: allBorder() }
      ws.mergeCells(`G${row + i}:J${row + i}`)
      r.getCell('G').value = empRows[i][1] ?? '—'
      r.getCell('G').style = { font: { size: 8 }, border: allBorder() }
      r.height = 14
    })
    row += provRows.length

    // ── Sección: DETALLE DE ÍTEMS ────────────────────────────────────────────
    ws.mergeCells(`A${row}:J${row}`)
    ws.getCell(`A${row}`).value = 'DETALLE DE ÍTEMS REQUERIDOS'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    // Cabecera tabla ítems
    const thRow = ws.getRow(row)
    const hdrs = ['ITEM #', 'TIPO', 'CÓDIGO', 'DESCRIPCIÓN DEL BIEN O SERVICIO',
                  'UNIDAD', 'QTY SOLIC.', 'INFORMACIÓN ADICIONAL',
                  'P. UNIT. (USD)', 'TOTAL (USD)', 'FECHA ENTREGA']
    const cols = ['A','B','C','D','E','F','G','H','I','J']
    hdrs.forEach((h, i) => {
      thRow.getCell(cols[i]).value = h
      thRow.getCell(cols[i]).style = headerStyle(TEAL2)
    })
    thRow.height = 28
    row++

    // Filas de ítems
    ;(items ?? []).forEach((it: any) => {
      const r = ws.getRow(row)
      const total = Number(it.cantidad) * Number(it.precio_unitario)
      const vals = [
        it.linea, it.tipo ?? '', it.codigo ?? '', it.descripcion,
        it.unidad, it.cantidad, it.informacion_adicional ?? '',
        usd(Number(it.precio_unitario)), usd(total), fmtDate(it.fecha_entrega),
      ]
      vals.forEach((v, i) => {
        r.getCell(cols[i]).value = v
        r.getCell(cols[i]).style = cellStyle(false, i >= 7 ? 'right' : i === 0 ? 'center' : 'left')
      })
      r.height = 20
      row++
    })

    // Totales
    const subtotal = Number(oc.valor_total) || 0
    const iva      = subtotal * 0.15
    const totalOC  = subtotal + iva
    const totalRows = [
      ['VALOR TOTAL DEL REQUERIMIENTO (USD) — sin IVA:', usd(subtotal)],
      ['IVA 15%:', usd(iva)],
      ['VALOR TOTAL CON IVA 15%:', usd(totalOC)],
    ]
    totalRows.forEach(([lbl, val]) => {
      ws.mergeCells(`A${row}:H${row}`)
      ws.getCell(`A${row}`).value = lbl
      ws.getCell(`A${row}`).style = { font: { bold: true, size: 9 }, alignment: { horizontal: 'right' }, border: allBorder() }
      ws.mergeCells(`I${row}:J${row}`)
      ws.getCell(`I${row}`).value = val
      ws.getCell(`I${row}`).style = { font: { bold: true, size: 9, color: { argb: `FF${TEAL2}` } }, alignment: { horizontal: 'right' }, border: allBorder() }
      ws.getRow(row).height = 16
      row++
    })

    // ── Condiciones mínimas ──────────────────────────────────────────────────
    row++
    ws.mergeCells(`A${row}:J${row}`)
    ws.getCell(`A${row}`).value = 'CONDICIONES MÍNIMAS PARA PROVEEDORES (certificaciones, normas, fichas técnicas, etc.)'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 16
    row++

    ws.mergeCells(`A${row}:J${row + 2}`)
    ws.getCell(`A${row}`).value = oc.condiciones_minimas ?? ''
    ws.getCell(`A${row}`).style = { font: { size: 8 }, alignment: { wrapText: true, vertical: 'top' }, border: allBorder() }
    ws.getRow(row).height = 50
    row += 3

    // ── Aprobaciones ─────────────────────────────────────────────────────────
    row++
    ws.mergeCells(`A${row}:J${row}`)
    ws.getCell(`A${row}`).value = 'APROBACIONES'
    ws.getCell(`A${row}`).style = headerStyle()
    ws.getRow(row).height = 14
    row++

    // Cabeceras aprobaciones
    const aprobCols = [
      ['A', 'B', 'ELABORADO POR'],
      ['C', 'D', 'APROBADO POR\nCOORDINADOR DEL ÁREA'],
      ['E', 'G', 'APROBADO POR\nCOORDINADOR DE COMPRAS/GERENTE GENERAL'],
      ['H', 'J', 'RECIBIDO Y CONFIRMADO (PROVEEDOR)'],
    ] as const
    aprobCols.forEach(([from, to, lbl]) => {
      ws.mergeCells(`${from}${row}:${to}${row}`)
      ws.getCell(`${from}${row}`).value = lbl
      ws.getCell(`${from}${row}`).style = headerStyle(TEAL2)
    })
    ws.getRow(row).height = 28
    row++

    // Nombre y cargo
    const aprobVals = [
      ['A', 'B', `${oc.creado_por_nombre ?? ''}\n${creadorCargo}`],
      ['C', 'D', ''],
      ['E', 'G', `${oc.aprobado_por_nombre ?? ''}\nCoordinador de Compras / Gerente General`],
      ['H', 'J', ''],
    ] as const
    aprobVals.forEach(([from, to, val]) => {
      ws.mergeCells(`${from}${row}:${to}${row}`)
      ws.getCell(`${from}${row}`).value = val
      ws.getCell(`${from}${row}`).style = { font: { size: 8 }, alignment: { wrapText: true, vertical: 'top' }, border: allBorder() }
    })
    ws.getRow(row).height = 28
    row++

    // Firma
    aprobCols.forEach(([from, to]) => {
      ws.mergeCells(`${from}${row}:${to}${row}`)
      ws.getCell(`${from}${row}`).value = 'Firma / Fecha: _______________'
      ws.getCell(`${from}${row}`).style = { font: { size: 7, color: { argb: 'FF94a3b8' } }, alignment: { vertical: 'bottom' }, border: allBorder() }
    })
    ws.getRow(row).height = 30

    // ── Generar buffer ───────────────────────────────────────────────────────
    const rawBuffer = await wb.xlsx.writeBuffer()
    const nombre    = `OC_${oc.numero_oc}_${(oc.proveedor ?? 'proveedor').replace(/[^a-zA-Z0-9\-_.]/g, '-')}`

    return new NextResponse(new Blob([rawBuffer]), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('Excel error:', err)
    return NextResponse.json({ error: 'Error al generar Excel' }, { status: 500 })
  }
}
