import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { calcularAlertaStock } from '@/lib/bodega-alertas'
import ExcelJS from 'exceljs'

// Spec: HU-033 CA-04 — roles propios de este reporte (incluye bodega/consulta,
// a diferencia de ROLES_REPORTES_COMPLETOS).
const ROLES_REPORTE_STOCK = ['bodega', 'compras', 'admin', 'gerencia', 'consulta']

function headerStyle(): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
    alignment: { vertical: 'middle' },
  }
}

function nombreArchivo(): string {
  const ahora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fecha = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`
  return `Bodega_Stock_Bajo_Minimo_${fecha}_${hora}.xlsx`
}

// Spec: HU-033 CA-03 — reporte de productos con saldo por debajo de su
// Stock Mínimo configurado.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTE_STOCK.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { data: productos } = await adminClient()
      .from('inventario')
      .select('codigo, descripcion, saldo_existencias, stock_minimo, bodega_id')
      .not('stock_minimo', 'is', null)

    const bodegaIds = [...new Set((productos ?? []).map((p) => p.bodega_id).filter((b): b is string => !!b))]
    const { data: bodegas } = bodegaIds.length > 0
      ? await adminClient().from('bodegas').select('id, nombre').in('id', bodegaIds)
      : { data: [] as { id: string; nombre: string }[] }
    const bodegaPorId = new Map((bodegas ?? []).map((b) => [b.id, b.nombre]))

    const filasBajoMinimo = (productos ?? []).filter((p) =>
      calcularAlertaStock(Number(p.saldo_existencias), p.stock_minimo != null ? Number(p.stock_minimo) : null, null).bajoMinimo
    )

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Stock Bajo Mínimo')
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Bodega', key: 'bodega', width: 20 },
      { header: 'Saldo Actual', key: 'saldo', width: 14 },
      { header: 'Stock Mínimo', key: 'minimo', width: 14 },
      { header: 'Diferencia', key: 'diferencia', width: 14 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const p of filasBajoMinimo) {
      const saldo = Number(p.saldo_existencias)
      const minimo = Number(p.stock_minimo)
      ws.addRow({
        codigo: p.codigo,
        descripcion: p.descripcion,
        bodega: p.bodega_id ? (bodegaPorId.get(p.bodega_id) ?? '—') : '—',
        saldo,
        minimo,
        diferencia: minimo - saldo,
      })
    }

    const buffer = await wb.xlsx.writeBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreArchivo()}"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar Excel' }, { status: 500 })
  }
}
