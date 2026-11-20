import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_BODEGA, parsearFiltrosReporte, obtenerMovimientosKardex } from '@/lib/bodega-reportes-query'
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
  return `Bodega_Reporte_Kardex_Valorizado_${fecha}_${hora}.xlsx`
}

// Spec: HU-035 CA-01 — Kardex valorizado (exige producto_id).
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
    if (!filtros.producto_id) {
      return NextResponse.json({ error: 'producto_id es requerido para este reporte' }, { status: 400 })
    }
    const filas = await obtenerMovimientosKardex(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Kardex Valorizado')
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Descripción', key: 'descripcion', width: 36 },
      { header: 'Bodega', key: 'bodega', width: 18 },
      { header: 'Dirección', key: 'direccion', width: 12 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Costo Unitario', key: 'costo', width: 14 },
      { header: 'Saldo', key: 'saldo', width: 12 },
      { header: 'Costo Promedio', key: 'promedio', width: 16 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const f of filas) {
      ws.addRow({
        fecha: f.fecha, codigo: f.producto_codigo, descripcion: f.producto_descripcion,
        bodega: f.bodega_nombre, direccion: f.direccion, tipo: f.tipo,
        cantidad: f.cantidad, costo: f.costo_unitario, saldo: f.saldo_resultante, promedio: f.costo_promedio_resultante,
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
