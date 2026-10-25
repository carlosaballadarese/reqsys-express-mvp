import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_OCA, parsearFiltrosReporte, obtenerDetalleReleases } from '@/lib/oca-reportes-query'
import ExcelJS from 'exceljs'

const ESTADO_LABEL: Record<string, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación', aprobado: 'Aprobado', rechazado: 'Rechazado', anulado: 'Anulado',
}

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
  return `OCA_Reporte_Releases_${fecha}_${hora}.xlsx`
}

// Spec: HU-023 CA-02
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
    const filas = await obtenerDetalleReleases(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Detalle de Releases')
    ws.columns = [
      { header: 'N° Release', key: 'numero_release', width: 20 },
      { header: 'N° OCA', key: 'numero_oca', width: 18 },
      { header: 'Proveedor', key: 'proveedor', width: 26 },
      { header: 'Centro de Costo', key: 'area', width: 22 },
      { header: 'Solicitante', key: 'solicitante', width: 22 },
      { header: 'Monto Total', key: 'monto', width: 14 },
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Facturado', key: 'facturado', width: 12 },
      { header: 'N° Factura', key: 'numero_factura', width: 16 },
      { header: 'Fecha Generación', key: 'created_at', width: 18 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of filas) {
      ws.addRow({
        numero_release: fila.numero_release,
        numero_oca: fila.numero_oca,
        proveedor: fila.proveedor_nombre,
        area: fila.area_nombre,
        solicitante: fila.solicitante_nombre,
        monto: fila.monto_total,
        estado: ESTADO_LABEL[fila.estado] ?? fila.estado,
        facturado: fila.facturado ? 'Sí' : 'No',
        numero_factura: fila.numero_factura ?? '',
        created_at: new Date(fila.created_at).toLocaleString('es-EC'),
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
