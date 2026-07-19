import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { ROLES_VISTA, parsearFiltrosVista, obtenerFilasVista } from '@/lib/np-vista-query'
import ExcelJS from 'exceljs'

// Espejo de las etiquetas ya usadas en app/compras/vista-np/page.tsx — se
// duplican aquí (no es 'use client', pero se mantiene el mismo patrón de mapas
// locales ya establecido en el resto de exportaciones del proyecto).
const ESTADO_LABEL: Record<string, string> = {
  borrador:         'Borrador',
  pendiente:        'En aprobación',
  aprobada:         'Aprobada',
  rechazada:        'Rechazada',
  devuelta:         'Devuelta',
  en_gestion:       'En gestión',
  oc_directa:       'OC directa',
  oc_generada:      'OC generada',
  oc_en_aprobacion: 'OC en aprobación',
  oc_aprobada:      'OC aprobada',
  completada:       'Completada',
}

const PRIORIDAD_LABEL: Record<string, string> = {
  excepcional: 'Excepcional', alta: 'Alta', media: 'Media', baja: 'Baja',
}

const SLA_LABEL: Record<string, string> = {
  no_activo: 'No activo', pausado: 'Pausado', a_tiempo: 'A tiempo', vencido: 'Vencido',
}

// Spec CA-04: encabezados en negrita con fondo gris claro
function headerStyle(): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
    alignment: { vertical: 'middle' },
  }
}

function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function fmtSlaDias(n: number | null) {
  if (n === null) return ''
  const redondeado = Math.round(n * 10) / 10
  return redondeado > 0 ? `+${redondeado}` : String(redondeado)
}

// Spec CA-05
function nombreArchivo(): string {
  const ahora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fecha = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`
  const hora  = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}`
  return `NP_Vista_por_NP_${fecha}_${hora}.xlsx`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()

    if (!perfil || !ROLES_VISTA.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const filtros = parsearFiltrosVista(req.nextUrl.searchParams)
    const { rows } = await obtenerFilasVista(filtros, user.id, perfil.rol)

    const wb = new ExcelJS.Workbook()

    // ── Hoja "NP" (CA-02) ──────────────────────────────────────────────────
    const wsNP = wb.addWorksheet('NP')
    wsNP.columns = [
      { header: 'Número',         key: 'numero',      width: 16 },
      { header: 'Fecha Creación', key: 'fecha',        width: 14 },
      { header: 'Área',           key: 'area',         width: 16 },
      { header: 'Solicitante',    key: 'solicitante',  width: 22 },
      { header: 'Descripción',    key: 'descripcion',  width: 32 },
      { header: 'Prioridad',      key: 'prioridad',    width: 12 },
      { header: 'Comprador',      key: 'comprador',    width: 22 },
      { header: 'SLA',            key: 'sla',          width: 12 },
      { header: 'SLA (días)',     key: 'sla_dias',     width: 12 },
      { header: 'Estado',         key: 'estado',       width: 16 },
      { header: 'Acción',         key: 'accion',       width: 22 },
      { header: 'Total Estimado', key: 'total',        width: 14 },
    ]
    wsNP.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of rows) {
      wsNP.addRow({
        numero:      fila.numero,
        fecha:       fmtDate(fila.created_at),
        area:        fila.area,
        solicitante: fila.solicitante_nombre,
        descripcion: fila.descripcion_general ?? '',
        prioridad:   PRIORIDAD_LABEL[fila.prioridad] ?? fila.prioridad,
        comprador:   fila.asignado_nombre ?? '',
        sla:         SLA_LABEL[fila.sla_badge] ?? fila.sla_badge,
        sla_dias:    fmtSlaDias(fila.sla_dias_signo),
        estado:      ESTADO_LABEL[fila.estado] ?? fila.estado,
        accion:      fila.accion_agregada?.descripcion ?? '',
        total:       fila.total_estimado !== null ? Number(fila.total_estimado) : '',
      })
    }

    // ── Hoja "Líneas" (CA-02) ──────────────────────────────────────────────
    const wsLineas = wb.addWorksheet('Líneas')
    wsLineas.columns = [
      { header: 'Número NP',      key: 'numero_np',   width: 16 },
      { header: 'N° Línea',       key: 'linea',        width: 10 },
      { header: 'Descripción',    key: 'descripcion',  width: 32 },
      { header: 'Cantidad',       key: 'cantidad',     width: 10 },
      { header: 'Precio Unitario', key: 'precio',      width: 14 },
      { header: 'Acción',         key: 'accion',       width: 22 },
      { header: 'N° de OC',       key: 'oc',           width: 16 }, // RN-03: texto plano
    ]
    wsLineas.getRow(1).eachCell(cell => { cell.style = headerStyle() })

    for (const fila of rows) {
      for (const linea of fila.lineas) {
        wsLineas.addRow({
          numero_np:   fila.numero,
          linea:       linea.linea,
          descripcion: linea.descripcion,
          cantidad:    linea.cantidad,
          precio:      linea.precio_unitario !== null ? Number(linea.precio_unitario) : '',
          accion:      linea.accion?.descripcion ?? '',
          oc:          linea.oc?.numero_oc ?? '',
        })
      }
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
