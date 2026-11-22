import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { parsearArchivoMaestro, clasificarReemplazo, type ProductoActual } from '@/lib/bodega-reemplazo-inventario'
import { paginarRange } from '@/lib/bodega-reportes-query'

// Spec: HU-041 CA-09 — mismos roles que HU-039 (admin/compras, sin bodega —
// alto impacto: puede desactivar muchos productos y generar muchos
// movimientos de Kardex de una sola vez).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient().from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    const filasArchivo = parsearArchivoMaestro(workbook)

    // Spec: CA-01 — se compara contra TODOS los productos reales (activos e
    // inactivos, ya que uno inactivo puede reaparecer en el archivo, CA-05).
    // Paginado explícito (hallazgo real de validación): PostgREST corta en
    // 1000 filas por defecto — sin esto, a escala real (~1,256 productos)
    // una porción del catálogo quedaba fuera de `productosActuales`, y esos
    // códigos reales se clasificaban como "alta" en vez de "sin cambio"
    // (mismo patrón ya documentado en DEF-HU-035-001).
    const productos = await paginarRange<ProductoActual>((desde, hasta) =>
      adminClient()
        .from('inventario')
        .select('id, codigo, activo, saldo_existencias, costo_unitario')
        .range(desde, hasta)
    )

    const clasificacion = clasificarReemplazo(filasArchivo, productos)

    return NextResponse.json(clasificacion)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al analizar el archivo'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
}
