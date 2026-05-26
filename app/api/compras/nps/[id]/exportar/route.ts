import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
// @ts-ignore
import * as XLSX from 'xlsx'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const [{ data: np }, { data: items }] = await Promise.all([
      adminClient().from('notas_pedido').select('numero, area, solicitante_nombre, created_at').eq('id', id).single(),
      adminClient().from('items_np').select('linea, codigo, descripcion, unidad, cantidad, precio_unitario, total').eq('nota_pedido_id', id).order('linea'),
    ])

    if (!np) return NextResponse.json({ error: 'NP no encontrada' }, { status: 404 })
    if (!items || items.length === 0) return NextResponse.json({ error: 'La NP no tiene ítems' }, { status: 404 })

    const rows = items.map(i => ({
      'Línea':       i.linea,
      'Código':      i.codigo ?? '',
      'Descripción': i.descripcion,
      'Unidad':      i.unidad,
      'Cantidad':    Number(i.cantidad),
      'P. Unitario': Number(i.precio_unitario),
      'Total':       Number(i.total),
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
