import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_REPORTES_BODEGA, obtenerProveedoresReporte } from '@/lib/bodega-catalogos-reportes'
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
  return `Bodega_Catalogo_Proveedores_${fecha}_${hora}.xlsx`
}

// Spec: HU-040 CA-07 — reporte completo del catálogo de Proveedores.
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_REPORTES_BODEGA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filas = await obtenerProveedoresReporte()

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Proveedores')
    ws.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'RUC', key: 'ruc', width: 16 },
      { header: 'Clasificación', key: 'clasificacion', width: 16 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Ciudad', key: 'ciudad', width: 16 },
      { header: 'Giro de Negocio', key: 'giro', width: 24 },
      { header: 'Dirección', key: 'direccion', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Contacto', key: 'contacto', width: 20 },
      { header: 'Activo', key: 'activo', width: 12 },
    ]
    ws.getRow(1).eachCell((cell) => { cell.style = headerStyle() })

    for (const f of filas) {
      ws.addRow({
        nombre: f.nombre, ruc: f.ruc ?? '—', clasificacion: f.clasificacion ?? '—',
        categoria: f.categoria ?? '—', ciudad: f.ciudad ?? '—', giro: f.giroNegocio ?? '—',
        direccion: f.direccion ?? '—', telefono: f.telefono ?? '—', email: f.email ?? '—',
        contacto: f.contacto ?? '—', activo: f.activo ? 'Sí' : 'No',
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
