import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_BODEGA, parsearFiltrosReporte, obtenerExistenciasValorizadas } from '@/lib/bodega-reportes-query'
import ExcelJS from 'exceljs'

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
  return `Bodega_Reporte_Existencias_Valorizadas_${fecha}_${hora}.xlsx`
}

// Spec: HU-035 CA-02 — existencias actuales valorizadas, filtrable por
// Bodega/Categoría/Área Técnica.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_BODEGA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosReporte(req.nextUrl.searchParams)
    const filas = await obtenerExistenciasValorizadas(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Existencias Valorizadas')
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Bodega', key: 'bodega', width: 18 },
      { header: 'Categoría', key: 'categoria', width: 20 },
      { header: 'Saldo', key: 'saldo', width: 12 },
      { header: 'Costo Unitario', key: 'costo', width: 14 },
      { header: 'Valor Total', key: 'valor', width: 14 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const f of filas) {
      ws.addRow({
        codigo: f.codigo, descripcion: f.descripcion, bodega: f.bodega_nombre, categoria: f.categoria_nombre,
        saldo: f.saldo_existencias, costo: f.costo_unitario, valor: f.valor_total,
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
