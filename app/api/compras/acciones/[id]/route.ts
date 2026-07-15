import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

async function verificarAdminOCompras() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await adminClient()
    .from('perfiles').select('rol').eq('id', user.id).single()
  return perfil && ['admin', 'compras'].includes(perfil.rol) ? user : null
}

// Spec: HU-009 CA-17 (orden único)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params
    const { orden, descripcion } = await req.json()
    if (orden === undefined || orden === null || !descripcion) {
      return NextResponse.json({ error: 'orden y descripción son requeridos' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('acciones_gestion')
      .update({ orden, descripcion: descripcion.trim() })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una Acción con ese número de orden' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await registrarAuditoria({
      accion:     'editar_accion',
      entidad:    'accion_gestion',
      entidad_id: id,
      referencia: String(orden),
      detalle:    { orden, descripcion },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// Spec: HU-009 CA-17
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const { error } = await adminClient()
    .from('acciones_gestion')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrarAuditoria({
    accion:     'eliminar_accion',
    entidad:    'accion_gestion',
    entidad_id: id,
    referencia: id,
    detalle:    {},
  })

  return NextResponse.json({ success: true })
}
