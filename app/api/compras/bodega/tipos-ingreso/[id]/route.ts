import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'

type Auth = { ok: true } | { ok: false; status: 401 | 403 }

async function verificarAdminOCompras(): Promise<Auth> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) return { ok: false, status: 403 }
  return { ok: true }
}

// Spec: HU-037 CA-06/RN-01/RN-03 — único campo editable es `activo` (a
// diferencia de bodegas/[id], no se permite editar `codigo`/`nombre`: el
// motor de Kardex compara literalmente el `codigo` de documentos_ingreso
// .tipo_movimiento, editarlo aquí rompería esa comparación en silencio). Sin
// DELETE físico — desactivar es la única vía de retiro.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verificarAdminOCompras()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const { activo } = await req.json()

    if (typeof activo !== 'boolean') {
      return NextResponse.json({ error: 'activo debe ser booleano' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('tipos_ingreso')
      .update({ activo })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
