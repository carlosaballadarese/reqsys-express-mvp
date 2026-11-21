import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { analizarArchivoMigracion } from '@/lib/bodega-analisis-migracion'

// Spec: HU-039 CA-01/RN-04 — roles admin/compras (ver HU-039-v2.md RN-04
// para el razonamiento de por qué no se amplía a bodega/asistente_compras).
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
    const informe = await analizarArchivoMigracion(buffer)

    return NextResponse.json(informe)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al analizar el archivo'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
}
