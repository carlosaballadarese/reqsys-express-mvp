import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_OCA, parsearFiltrosReporte, obtenerEstadoOcas } from '@/lib/oca-reportes-query'
import ExcelJS from 'exceljs'

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_aprobacion: 'En aprobación', vigente: 'Vigente',
  suspendida: 'Suspendida', agotada: 'Agotada', vencida: 'Vencida', cerrada: 'Cerrada',
}
const TIPO_LABEL: Record<string, string> = {
  precio_fijo: 'Precio fijo', precio_variable_tope: 'Precio variable (con tope)',
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
  return `OCA_Reporte_Estado_${fecha}_${hora}.xlsx`
}

// Spec: HU-023 CA-01
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
    const filas = await obtenerEstadoOcas(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Estado de OCA')
    ws.columns = [
      { header: 'N° OCA', key: 'numero_oca', width: 18 },
      { header: 'Proveedor', key: 'proveedor', width: 26 },
      { header: 'Tipo', key: 'tipo', width: 20 },
      { header: 'Fecha Inicio', key: 'fecha_inicio', width: 14 },
      { header: 'Fecha Fin', key: 'fecha_fin', width: 14 },
      { header: 'Presupuesto Total', key: 'presupuesto', width: 16 },
      { header: 'Consumido', key: 'consumido', width: 14 },
      { header: 'Disponible', key: 'disponible', width: 14 },
      { header: '% Ejecución', key: 'porcentaje', width: 12 },
      { header: 'Estado', key: 'estado', width: 16 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of filas) {
      ws.addRow({
        numero_oca: fila.numero_oca,
        proveedor: fila.proveedor_nombre,
        tipo: TIPO_LABEL[fila.tipo] ?? fila.tipo,
        fecha_inicio: fila.fecha_inicio,
        fecha_fin: fila.fecha_fin,
        presupuesto: fila.presupuesto_total,
        consumido: fila.consumido,
        disponible: fila.disponible,
        porcentaje: fila.porcentaje_ejecucion,
        estado: ESTADO_LABEL[fila.estado] ?? fila.estado,
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
