import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_OCA, parsearFiltrosReporte, obtenerHistoricoEnmiendas } from '@/lib/oca-reportes-query'
import ExcelJS from 'exceljs'

const TIPO_ENMIENDA_LABEL: Record<string, string> = {
  incremento_presupuesto: 'Incremento de presupuesto',
  extension_plazo: 'Extensión de plazo',
  modificacion_precios: 'Modificación de lista de precios',
  cambio_modalidad_facturacion: 'Cambio de modalidad de facturación',
}
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
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
  return `OCA_Reporte_Historico_Enmiendas_${fecha}_${hora}.xlsx`
}

// Spec: HU-023 CA-04
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
    const filas = await obtenerHistoricoEnmiendas(filtros)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Histórico de Enmiendas')
    ws.columns = [
      { header: 'N° OCA', key: 'numero_oca', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 28 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Solicitante', key: 'solicitante', width: 22 },
      { header: 'Solicitado En', key: 'solicitado_en', width: 18 },
      { header: 'Aprobador', key: 'aprobador', width: 22 },
      { header: 'Aprobado En', key: 'aprobado_en', width: 18 },
      { header: 'Motivo de Rechazo', key: 'motivo_rechazo', width: 30 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of filas) {
      ws.addRow({
        numero_oca: fila.numero_oca,
        tipo: TIPO_ENMIENDA_LABEL[fila.tipo] ?? fila.tipo,
        estado: ESTADO_LABEL[fila.estado] ?? fila.estado,
        solicitante: fila.solicitante_nombre,
        solicitado_en: new Date(fila.solicitado_en).toLocaleString('es-EC'),
        aprobador: fila.aprobador_nombre ?? '',
        aprobado_en: fila.aprobado_en ? new Date(fila.aprobado_en).toLocaleString('es-EC') : '',
        motivo_rechazo: fila.motivo_rechazo ?? '',
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
