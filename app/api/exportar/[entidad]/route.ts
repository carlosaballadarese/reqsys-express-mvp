import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
// @ts-ignore — xlsx ships its own types
import * as XLSX from 'xlsx'


const ENTIDADES_PERMITIDAS = ['nps', 'ocs', 'inventario', 'proveedores', 'coordinadores']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entidad: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { entidad } = await params

  if (!ENTIDADES_PERMITIDAS.includes(entidad)) {
    return NextResponse.json({ error: 'Entidad no válida' }, { status: 400 })
  }

  try {
    const { rows, filename } = await fetchData(entidad)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Sin datos para exportar' }, { status: 404 })
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')

    // Ajustar ancho de columnas automáticamente
    const colWidths = Object.keys(rows[0]).map(key => ({
      wch: Math.max(key.length, ...rows.slice(0, 50).map(r => String(r[key] ?? '').length)) + 2
    }))
    ws['!cols'] = colWidths

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar el archivo' }, { status: 500 })
  }
}

async function fetchData(entidad: string): Promise<{ rows: Record<string, unknown>[]; filename: string }> {
  const fecha = new Date().toISOString().slice(0, 10)

  if (entidad === 'nps') {
    const { data: nps } = await adminClient()
      .from('notas_pedido')
      .select('numero, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, descripcion_general, estado, total_estimado, motivo_rechazo, created_at')
      .order('created_at', { ascending: false })

    const rows = (nps ?? []).map(np => ({
      'Número NP':          np.numero,
      'Solicitante':        np.solicitante_nombre,
      'Email Solicitante':  np.solicitante_email,
      'Área':               np.area,
      'Prioridad':          np.prioridad,
      'Tipo de Compra':     np.tipo_compra,
      'Centro de Costo':    np.centro_costo,
      'Descripción':        np.descripcion_general,
      'Estado':             np.estado,
      'Total Estimado USD': Number(np.total_estimado ?? 0).toFixed(2),
      'Motivo Rechazo':     np.motivo_rechazo ?? '',
      'Fecha Creación':     np.created_at ? new Date(np.created_at).toLocaleDateString('es-VE') : '',
    }))

    return { rows, filename: `REQSYS_NPs_${fecha}.xlsx` }
  }

  if (entidad === 'ocs') {
    const { data: ocs } = await adminClient()
      .from('registro_compras')
      .select('numero_oc, numero_np, proveedor, area, tipo_compra, centro_costo, descripcion_oc, numero_factura, fecha_factura, valor_total, valor_retenido, valor_a_pagar, tipo_pago, banco, dias_credito, fecha_vencimiento, mes_pago, estado_oc, fecha_oc, created_at')
      .order('created_at', { ascending: false })

    const rows = (ocs ?? []).map(oc => ({
      'Número OC':          oc.numero_oc,
      'NP Origen':          oc.numero_np ?? '',
      'Proveedor':          oc.proveedor,
      'Área':               oc.area ?? '',
      'Tipo de Compra':     oc.tipo_compra ?? '',
      'Centro de Costo':    oc.centro_costo ?? '',
      'Descripción OC':     oc.descripcion_oc ?? '',
      'Nro Factura':        oc.numero_factura ?? '',
      'Fecha Factura':      oc.fecha_factura ? new Date(oc.fecha_factura).toLocaleDateString('es-VE') : '',
      'Valor Total USD':    Number(oc.valor_total ?? 0).toFixed(2),
      'Valor Retenido USD': Number(oc.valor_retenido ?? 0).toFixed(2),
      'Valor a Pagar USD':  Number(oc.valor_a_pagar ?? 0).toFixed(2),
      'Tipo de Pago':       oc.tipo_pago ?? '',
      'Banco':              oc.banco ?? '',
      'Días Crédito':       oc.dias_credito ?? 0,
      'Fecha Vencimiento':  oc.fecha_vencimiento ? new Date(oc.fecha_vencimiento).toLocaleDateString('es-VE') : '',
      'Mes de Pago':        oc.mes_pago ?? '',
      'Estado OC':          oc.estado_oc,
      'Fecha OC':           oc.fecha_oc ? new Date(oc.fecha_oc).toLocaleDateString('es-VE') : '',
      'Fecha Creación':     oc.created_at ? new Date(oc.created_at).toLocaleDateString('es-VE') : '',
    }))

    return { rows, filename: `REQSYS_OCs_${fecha}.xlsx` }
  }

  if (entidad === 'inventario') {
    const { data: inv } = await adminClient()
      .from('inventario')
      .select('codigo, descripcion, area, categoria, marca, saldo_existencias, costo_unitario, locacion, codigo_origen, descripcion_origen')
      .order('codigo')

    const rows = (inv ?? []).map(i => ({
      'Código':              i.codigo,
      'Descripción':         i.descripcion,
      'Área':                i.area ?? '',
      'Categoría':           i.categoria ?? '',
      'Marca':               i.marca ?? '',
      'Saldo Existencias':   Number(i.saldo_existencias ?? 0),
      'Costo Unitario USD':  Number(i.costo_unitario ?? 0).toFixed(2),
      'Locación':            i.locacion ?? '',
      'Código Origen':       i.codigo_origen ?? '',
      'Descripción Origen':  i.descripcion_origen ?? '',
    }))

    return { rows, filename: `REQSYS_Inventario_${fecha}.xlsx` }
  }

  if (entidad === 'proveedores') {
    const { data: provs } = await adminClient()
      .from('proveedores')
      .select('nombre, clasificacion, categoria, ciudad, direccion, telefono, email, contacto, activo')
      .order('nombre')

    const rows = (provs ?? []).map(p => ({
      'Nombre / Razón Social': p.nombre,
      'Clasificación':         p.clasificacion ?? '',
      'Categoría':             p.categoria ?? '',
      'Ciudad':                p.ciudad ?? '',
      'Dirección':             p.direccion ?? '',
      'Teléfono':              p.telefono ?? '',
      'Email':                 p.email ?? '',
      'Contacto':              p.contacto ?? '',
      'Activo':                p.activo ? 'Sí' : 'No',
    }))

    return { rows, filename: `REQSYS_Proveedores_${fecha}.xlsx` }
  }

  if (entidad === 'coordinadores') {
    const { data: coords } = await adminClient()
      .from('coordinadores_area')
      .select('area, nombre, email')
      .order('area')

    const rows = (coords ?? []).map(c => ({
      'Área':   c.area,
      'Nombre': c.nombre,
      'Email':  c.email,
    }))

    return { rows, filename: `REQSYS_Coordinadores_${fecha}.xlsx` }
  }

  return { rows: [], filename: 'export.xlsx' }
}
