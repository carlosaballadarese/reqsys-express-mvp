import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import type { FilaClasificada, ResultadoEjecucion } from '@/lib/bodega-reemplazo-inventario'

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
  return `Reemplazo_Total_Inventario_${fecha}_${hora}.xlsx`
}

const TIPO_LABEL: Record<FilaClasificada['tipo'], string> = {
  alta: 'Alta nueva',
  desactivacion: 'Desactivación',
  sin_cambio: 'Sin cambio',
  ajuste: 'Ajuste de saldo/costo',
}

// Spec: HU-041 CA-08 — detalle línea por línea completo, exportable después
// del análisis (CA-01) o de la ejecución real (CA-02 a CA-07). Recibe las
// filas ya clasificadas/ejecutadas como JSON, nunca reparsea el archivo.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !['admin', 'compras'].includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await req.json()
    const filas = (body.filas ?? []) as FilaClasificada[]
    const resultado = body.resultado as ResultadoEjecucion | undefined

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Detalle')
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Clasificación', key: 'tipo', width: 22 },
      { header: 'Saldo Actual', key: 'saldoActual', width: 14 },
      { header: 'Saldo Archivo', key: 'saldoArchivo', width: 14 },
      { header: 'Costo Actual', key: 'costoActual', width: 14 },
      { header: 'Costo Archivo', key: 'costoArchivo', width: 14 },
      { header: 'Reactiva', key: 'reactiva', width: 10 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const f of filas) {
      ws.addRow({
        codigo: f.codigo,
        tipo: TIPO_LABEL[f.tipo],
        saldoActual: f.tipo === 'ajuste' ? f.saldoActual : '',
        saldoArchivo: 'datos' in f ? f.datos.saldoExcel : '',
        costoActual: f.tipo === 'ajuste' ? f.costoActual : '',
        costoArchivo: 'datos' in f ? f.datos.costoExcel : '',
        reactiva: 'reactiva' in f && f.reactiva ? 'Sí' : '',
      })
    }

    if (resultado) {
      const wsResumen = wb.addWorksheet('Resumen Ejecución')
      wsResumen.columns = [
        { header: 'Métrica', key: 'metrica', width: 30 },
        { header: 'Valor', key: 'valor', width: 14 },
      ]
      wsResumen.getRow(1).eachCell((cell) => { cell.style = headerStyle() })
      wsResumen.addRow({ metrica: 'Altas', valor: resultado.altas })
      wsResumen.addRow({ metrica: 'Desactivaciones', valor: resultado.desactivaciones })
      wsResumen.addRow({ metrica: 'Reactivaciones', valor: resultado.reactivaciones })
      wsResumen.addRow({ metrica: 'Ajustes vía Ingreso', valor: resultado.ajustesIngreso })
      wsResumen.addRow({ metrica: 'Ajustes vía Egreso', valor: resultado.ajustesEgreso })
      wsResumen.addRow({ metrica: 'Errores', valor: resultado.errores.length })
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
