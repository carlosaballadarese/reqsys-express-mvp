import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'


// Spec: HU-045 CA-01 — antes hardcodeado a 'AL-I%'/'^AL-I(\d+)$', sin soportar
// otros prefijos de producto (ej. 'AL-C' de Consumibles). El prefijo se deriva
// en el cliente del campo "Código" de la Bodega elegida (texto libre sin
// formato forzado desde HU-026) y se pasa explícito por query param — este
// endpoint no necesita conocer la tabla `bodegas`.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const prefijoParam = new URL(req.url).searchParams.get('prefijo')?.trim()
  const prefijo = prefijoParam || 'AL-I'

  const { data, error } = await adminClient()
    .from('inventario')
    .select('codigo')
    .like('codigo', `${prefijo}%`)
    .order('codigo', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Extraer el número más alto de los códigos {prefijo}XXXX
  const prefijoEscapado = prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`^${prefijoEscapado}(\\d+)$`)
  let max = 0
  for (const row of data ?? []) {
    const match = row.codigo?.match(regex)
    if (match) {
      const n = parseInt(match[1])
      if (n > max) max = n
    }
  }

  const siguiente = `${prefijo}${String(max + 1).padStart(4, '0')}`
  return NextResponse.json({ codigo: siguiente })
}
