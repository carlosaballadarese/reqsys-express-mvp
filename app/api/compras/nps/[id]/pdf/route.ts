import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { NPDocumento } from '@/lib/np-pdf'
import { puedeVerPrecioNP } from '@/lib/np-precio'
import React from 'react'

// Spec RN-01: acceso de exportación = creador + compras + admin + asistente asignado
function tieneAccesoExportacion(
  np: { creado_por_id: string | null; asignado_a: string | null },
  userId: string,
  rol: string
): boolean {
  if (['compras', 'admin'].includes(rol)) return true
  if (np.creado_por_id === userId) return true
  if (rol === 'asistente_compras' && np.asignado_a === userId) return true
  return false
}

const NP_SELECT = [
  'id, numero, area, clasificacion, prioridad, tipo_compra, centro_costo',
  'descripcion_general, created_at',
  'es_regularizacion, fecha_provision',
  'proveedor_regularizacion_nombre, proveedor_regularizacion_identificacion',
  'creado_por_id, solicitante_nombre, asignado_a',
  'aprobador_np_nombre, aprobador_np_area',
  'condiciones_minimas',
].join(', ')

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    const rol = perfil?.rol ?? ''

    const [{ data: np }, { data: items }, { data: config }] = await Promise.all([
      adminClient().from('notas_pedido').select(NP_SELECT).eq('id', id).single(),
      adminClient().from('items_np')
        .select('linea, tipo, codigo, descripcion, unidad, cantidad, precio_unitario, total_estimado, informacion_adicional, proveedor_sugerido, fecha_requerida')
        .eq('nota_pedido_id', id).order('linea'),
      adminClient().from('configuracion_empresa')
        .select('documento_numero_np, revision_np').eq('id', 1).single(),
    ])

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })

    // Spec CA-02 / RN-01
    if (!tieneAccesoExportacion(np, user.id, rol))
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    // Spec RN-02: precio visible según puedeVerPrecioNP
    const mostrarPrecios = puedeVerPrecioNP(rol, np.es_regularizacion ?? false, np.creado_por_id, user.id)

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reqsys-express.vercel.app'
    const logoUrl = `${appUrl}/logo_arlift.png`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(NPDocumento, {
      np, items: items ?? [], mostrarPrecios,
      config: {
        documento_numero_np: config?.documento_numero_np ?? 'AL-L4-07-F01',
        revision_np:         config?.revision_np         ?? 1,
      },
      logoUrl,
    }) as any

    const buffer = await renderToBuffer(element)

    // Spec CA-11: NP_[numero]_[area].[ext]
    const area   = (np.area ?? 'NP').toUpperCase().replace(/[^A-Z0-9]/g, '-')
    const nombre = `NP_${np.numero}_${area}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${nombre}.pdf"`,
      },
    })
  } catch (err) {
    console.error('NP PDF error:', err)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}
