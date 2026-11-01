import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { puedeVerPrecioNP } from '@/lib/np-precio'
// @ts-ignore
import * as XLSX from 'xlsx'

// Spec: SC-003 CA-05 — este endpoint exportaba precio_unitario/total sin
// aplicar puedeVerPrecioNP, a diferencia de GET/excel/pdf de la misma NP
// (bypass del masking de precio por rol: solicitante/bodega podían
// descargar el precio real de cualquier NP vía este botón).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const [{ data: perfil }, { data: np }, { data: items }] = await Promise.all([
      adminClient().from('perfiles').select('rol').eq('id', user.id).single(),
      adminClient().from('notas_pedido').select('numero, area, solicitante_nombre, created_at, es_regularizacion, creado_por_id').eq('id', id).single(),
      adminClient().from('items_np').select('linea, codigo, descripcion, unidad, cantidad, precio_unitario, total').eq('nota_pedido_id', id).order('linea'),
    ])

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })
    if (!items || items.length === 0) return NextResponse.json({ error: 'La NP no tiene ítems' }, { status: 404 })

    const verPrecio = puedeVerPrecioNP(perfil?.rol ?? '', np.es_regularizacion ?? false, np.creado_por_id ?? null, user.id)

    const rows = items.map(i => ({
      'Línea':       i.linea,
      'Código':      i.codigo ?? '',
      'Descripción': i.descripcion,
      'Unidad':      i.unidad,
      'Cantidad':    Number(i.cantidad),
      'P. Unitario': verPrecio ? Number(i.precio_unitario) : 0,
      'Total':       verPrecio ? Number(i.total) : 0,
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ítems')

    const colWidths = Object.keys(rows[0]).map(key => ({
      wch: Math.max(key.length, ...rows.slice(0, 100).map(r => String((r as Record<string, unknown>)[key] ?? '').length)) + 2,
    }))
    ws['!cols'] = colWidths

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `${np.numero}-items.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
