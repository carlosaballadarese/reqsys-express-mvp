import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Spec: HU-043 CA-05/CA-07/CA-08/CA-11 — a diferencia de secuencia-ingreso/
// egreso/ensamblaje, opera sobre la fila fija (id=1) de guia_secuencia (HU-042)
// — contador global continuo, nunca por año (regulado por el SRI). El POST
// además bloquea (CA-11/RN-04) si el número inicial no supera al actual:
// a diferencia de NP/OC/Ingreso/Egreso/Ensamblaje, retroceder este contador
// arriesgaría reemitir digitalmente un número de guía ya usado en papel.

// GET — devuelve el número actual (fila fija, sin agrupar por año)
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('guia_secuencia')
    .select('ultimo_numero')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ultimo_numero: data?.ultimo_numero ?? 0 })
}

// POST — establece el número inicial (nunca por año; bloquea retroceder, CA-11)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!perfil || !['compras', 'admin'].includes(perfil.rol))
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { numero_inicial } = await req.json()

    if (numero_inicial === undefined || numero_inicial < 1) {
      return NextResponse.json({ error: 'Número inicial es requerido' }, { status: 400 })
    }

    const { data: actual, error: errorActual } = await adminClient()
      .from('guia_secuencia')
      .select('ultimo_numero')
      .eq('id', 1)
      .single()

    if (errorActual) return NextResponse.json({ error: errorActual.message }, { status: 500 })

    const ultimoNumeroActual = actual?.ultimo_numero ?? 0

    // Spec: CA-11/RN-04 — nunca permitir retroceder (ni igualar) el contador
    // real de Guías, por su implicación legal ante el SRI.
    if (Number(numero_inicial) <= ultimoNumeroActual) {
      return NextResponse.json(
        { error: `El número inicial debe ser mayor al actual (${ultimoNumeroActual})` },
        { status: 400 }
      )
    }

    const { error } = await adminClient()
      .from('guia_secuencia')
      .update({ ultimo_numero: Number(numero_inicial) - 1 })
      .eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, proximo: numero_inicial })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
