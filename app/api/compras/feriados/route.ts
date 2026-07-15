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

// Spec: HU-009 CA-10
export async function GET() {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data, error } = await adminClient()
    .from('feriados')
    .select('id, fecha, descripcion')
    .order('fecha')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Spec: HU-009 CA-10, CA-11 (fecha única)
export async function POST(req: NextRequest) {
  const user = await verificarAdminOCompras()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { fecha, descripcion } = await req.json()
    if (!fecha || !descripcion) {
      return NextResponse.json({ error: 'fecha y descripción son requeridos' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('feriados')
      .insert({ fecha, descripcion: descripcion.trim() })
      .select('id, fecha, descripcion')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un feriado registrado en esa fecha' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await registrarAuditoria({
      accion:     'crear_feriado',
      entidad:    'feriado',
      entidad_id: data.id,
      referencia: fecha,
      detalle:    { fecha, descripcion },
    })

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
