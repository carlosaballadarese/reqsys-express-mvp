import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_BODEGA, obtenerPuntosEntregaReporte } from '@/lib/bodega-catalogos-reportes'
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
  return `Bodega_Catalogo_LugarEntrega_${fecha}_${hora}.xlsx`
}

// Spec: HU-040 CA-05 — reporte completo del catálogo de Lugar de Entrega.
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_BODEGA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filas = await obtenerPuntosEntregaReporte()

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Lugar de Entrega')
    ws.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Cliente Final', key: 'cliente', width: 30 },
      { header: 'Activo', key: 'activo', width: 12 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const f of filas) {
      ws.addRow({ nombre: f.nombre, cliente: f.clienteFinalNombre ?? '—', activo: f.activo ? 'Sí' : 'No' })
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
