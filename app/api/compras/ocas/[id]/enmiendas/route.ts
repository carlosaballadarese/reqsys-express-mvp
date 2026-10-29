import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { validarEnmienda } from '@/lib/oca-enmiendas'

// Spec: HU-020 RN-01 — solo compras/admin solicitan enmiendas
const ROLES_SOLICITAR = ['compras', 'admin']
// Spec: HU-020 — histórico visible para los mismos 7 roles de CA-13/HU-018
const ROLES_VER = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_SOLICITAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: oca, error } = await adminClient()
      .from('oca').select('id, numero_oca, estado, fecha_fin, presupuesto_total, tipo').eq('id', id).single()
    if (error || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })

    const body = await req.json()

    // Spec: HU-020 RN-07/CA-08 — máximo 1 enmienda pendiente a la vez por OCA
    const { data: pendiente } = await adminClient()
      .from('oca_enmiendas').select('id').eq('oca_id', id).eq('estado', 'pendiente').maybeSingle()
    if (pendiente) {
      return NextResponse.json({ error: 'Ya existe una enmienda pendiente para esta OCA' }, { status: 409 })
    }

    const errorValidacion = validarEnmienda(body, oca)
    if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 })

    const { data: enmienda, error: errorInsert } = await adminClient()
      .from('oca_enmiendas')
      .insert({
        oca_id: id,
        tipo: body.tipo,
        justificacion: body.justificacion.trim(),
        referencia_contractual: body.referencia_contractual.trim(),
        monto_adicional: body.tipo === 'incremento_presupuesto' ? body.monto_adicional : null,
        fecha_fin_nueva: body.tipo === 'extension_plazo' ? body.fecha_fin_nueva : null,
        items_nuevos: body.tipo === 'modificacion_precios' ? body.items : null,
        // Spec: HU-022 — 4to tipo, mismo patrón condicional que los otros 3 campos específicos
        modalidad_facturacion_nueva: body.tipo === 'cambio_modalidad_facturacion' ? body.modalidad_facturacion_nueva : null,
        solicitado_por_id: user.id,
      })
      .select('id, tipo, estado')
      .single()

    if (errorInsert || !enmienda) {
      return NextResponse.json({ error: errorInsert?.message ?? 'Error al solicitar la enmienda' }, { status: 500 })
    }

    await registrarAuditoria({
      accion: 'solicitar_enmienda_oca',
      entidad: 'oca_enmienda',
      entidad_id: enmienda.id,
      referencia: oca.numero_oca,
    })

    return NextResponse.json({ id: enmienda.id, tipo: enmienda.tipo, estado: enmienda.estado }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_VER.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: enmiendas, error } = await adminClient()
      .from('oca_enmiendas').select('*').eq('oca_id', id).order('solicitado_en', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(enmiendas ?? [])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
