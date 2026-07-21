import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_LINEAS_PENDIENTES, parsearFiltrosLineasPendientes, obtenerLineasPendientes } from '@/lib/np-lineas-pendientes-query'
import ExcelJS from 'exceljs'

// Espejo acotado de los mapas de app/compras/lineas-pendientes/page.tsx — solo
// los 3 Estados reales de esta vista (a diferencia de los 11 de HU-012).
const ESTADO_LABEL: Record<string, string> = {
  aprobada:   'Aprobada',
  en_gestion: 'En gestión',
  oc_directa: 'OC directa',
}

const PRIORIDAD_LABEL: Record<string, string> = {
  excepcional: 'Excepcional', alta: 'Alta', media: 'Media', baja: 'Baja',
}

const SLA_LABEL: Record<string, string> = {
  no_activo: 'No activo', pausado: 'Pausado', a_tiempo: 'A tiempo', vencido: 'Vencido',
}

// Spec: HU-015 CA-04
function headerStyle(): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
    alignment: { vertical: 'middle' },
  }
}

// Spec: HU-015 CA-02 — reutilizado tal cual de vista/excel/route.ts (HU-012)
function fmtSlaDias(n: number | null) {
  if (n === null) return ''
  const redondeado = Math.round(n * 10) / 10
  return redondeado > 0 ? `+${redondeado}` : String(redondeado)
}

// Spec: HU-015 CA-05
function nombreArchivo(): string {
  const ahora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fecha = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`
  const hora  = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`
  return `NP_Lineas_Pendientes_${fecha}_${hora}.xlsx`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()

    if (!perfil || !ROLES_LINEAS_PENDIENTES.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosLineasPendientes(req.nextUrl.searchParams)
    const { rows } = await obtenerLineasPendientes(filtros, user.id, perfil.rol)

    const wb = new ExcelJS.Workbook()

    // ── Hoja única (CA-02) ────────────────────────────────────────────────
    const ws = wb.addWorksheet('Líneas Pendientes')
    ws.columns = [
      { header: 'Número NP',          key: 'numero_np',  width: 16 },
      { header: 'Solicitante',        key: 'solicitante', width: 22 },
      { header: 'N° Línea',           key: 'linea',        width: 10 },
      { header: 'Descripción',        key: 'descripcion',  width: 32 },
      { header: 'Cantidad',           key: 'cantidad',     width: 10 },
      { header: 'Proveedor Sugerido', key: 'proveedor',    width: 22 },
      { header: 'Prioridad',          key: 'prioridad',    width: 12 },
      { header: 'Precio Unitario',    key: 'precio',       width: 14 },
      { header: 'Total Estimado',     key: 'total',        width: 14 },
      { header: 'SLA',                key: 'sla',          width: 12 },
      { header: 'SLA (días)',         key: 'sla_dias',     width: 12 },
      { header: 'Estado',             key: 'estado',       width: 16 },
      { header: 'Acción',             key: 'accion',       width: 22 },
    ]
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of rows) {
      ws.addRow({
        numero_np:   fila.np_numero,
        solicitante: fila.solicitante_nombre,
        linea:       fila.linea,
        descripcion: fila.descripcion,
        cantidad:    fila.cantidad,
        proveedor:   fila.proveedor_sugerido ?? '',
        prioridad:   PRIORIDAD_LABEL[fila.prioridad] ?? fila.prioridad,
        precio:      fila.precio_unitario !== null ? Number(fila.precio_unitario) : '',
        total:       fila.total_estimado !== null ? Number(fila.total_estimado) : '',
        sla:         SLA_LABEL[fila.sla_badge] ?? fila.sla_badge,
        sla_dias:    fmtSlaDias(fila.sla_dias_signo),
        estado:      ESTADO_LABEL[fila.estado] ?? fila.estado,
        accion:      fila.accion?.descripcion ?? '',
      })
    }

    const buffer = await wb.xlsx.writeBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreArchivo()}"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar Excel' }, { status: 500 })
  }
}
