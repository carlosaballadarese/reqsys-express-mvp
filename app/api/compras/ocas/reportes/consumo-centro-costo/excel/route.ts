import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_OCA, parsearFiltrosReporte, obtenerConsumoPorCentroCosto } from '@/lib/oca-reportes-query'
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
  return `OCA_Reporte_Consumo_Centro_Costo_${fecha}_${hora}.xlsx`
}

// Spec: HU-023 CA-03
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_OCA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosReporte(req.nextUrl.searchParams)
    const filas = await obtenerConsumoPorCentroCosto(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Consumo por Centro de Costo')
    ws.columns = [
      { header: 'Centro de Costo', key: 'area', width: 26 },
      { header: 'Monto Consumido', key: 'monto', width: 16 },
      { header: 'Cantidad de Releases', key: 'cantidad', width: 18 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of filas) {
      ws.addRow({ area: fila.area_nombre, monto: fila.monto_consumido, cantidad: fila.cantidad_releases })
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
