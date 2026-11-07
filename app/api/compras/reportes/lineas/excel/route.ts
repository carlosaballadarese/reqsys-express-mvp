import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTE_LINEAS, parsearFiltrosReporteLineas, obtenerFilasReporteLineas } from '@/lib/reporte-lineas-np-query'
import ExcelJS from 'exceljs'

// Spec: SC-007 CA-10
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
  return `Reporte_Lineas_NP_OC_OCA_${fecha}_${hora}.xlsx`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()

    if (!perfil || !ROLES_REPORTE_LINEAS.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosReporteLineas(req.nextUrl.searchParams)
    const filas = await obtenerFilasReporteLineas(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Líneas')
    ws.columns = [
      { header: 'N° NP',               key: 'np_numero',          width: 16 },
      { header: 'Área',                key: 'area',               width: 20 },
      { header: 'Estado NP',           key: 'estado_np',          width: 16 },
      { header: 'Fecha NP aprobada',   key: 'fecha_np_aprobada',  width: 16 },
      { header: 'N° línea',            key: 'linea',              width: 10 },
      { header: 'Código',              key: 'codigo',             width: 14 },
      { header: 'Descripción',         key: 'descripcion',        width: 32 },
      { header: 'Cantidad',            key: 'cantidad',           width: 10 },
      { header: 'Proveedor sugerido',  key: 'proveedor_sugerido', width: 22 },
      { header: 'Precio unitario NP',  key: 'precio_unitario_np', width: 16 },
      { header: 'N° OC',               key: 'oc_numero',          width: 16 },
      { header: 'Proveedor OC',        key: 'oc_proveedor',       width: 22 },
      { header: 'Precio unitario OC',  key: 'oc_precio_unitario', width: 16 },
      { header: 'Fecha OC aprobada',   key: 'oc_fecha_aprobada',  width: 16 },
      { header: 'N° OCA',              key: 'oca_numero',         width: 16 },
      { header: 'Proveedor OCA',       key: 'oca_proveedor',      width: 22 },
      { header: 'Fecha OCA aprobada',  key: 'oca_fecha_aprobada', width: 16 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of filas) {
      ws.addRow({
        np_numero:          fila.np_numero,
        area:               fila.area,
        estado_np:          fila.estado_np,
        fecha_np_aprobada:  fila.fecha_np_aprobada ?? '',
        linea:              fila.linea,
        codigo:             fila.codigo ?? '',
        descripcion:        fila.descripcion,
        cantidad:           fila.cantidad,
        proveedor_sugerido: fila.proveedor_sugerido ?? '',
        precio_unitario_np: fila.precio_unitario_np,
        oc_numero:          fila.oc_numero ?? '',
        oc_proveedor:       fila.oc_proveedor ?? '',
        oc_precio_unitario: fila.oc_precio_unitario ?? '',
        oc_fecha_aprobada:  fila.oc_fecha_aprobada ?? '',
        oca_numero:         fila.oca_numero ?? '',
        oca_proveedor:      fila.oca_proveedor ?? '',
        oca_fecha_aprobada: fila.oca_fecha_aprobada ?? '',
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
