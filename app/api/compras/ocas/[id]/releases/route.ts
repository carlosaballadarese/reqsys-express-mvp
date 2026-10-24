import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularPresupuestoConsumido, ESTADOS_OCA_ACTIVA } from '@/lib/oca-estado'
import { validarGenerarRelease, type ReleaseItemInput } from '@/lib/oca-release-validaciones'
import { calcularAprobadorAsignado } from '@/lib/np-area'

// Spec: HU-021 RN-01 — quién genera un release
const ROLES_GENERAR = ['solicitante', 'bodega', 'compras', 'admin', 'asistente_compras']
// Spec: HU-021 CA-12 — histórico visible para los mismos 7 roles de CA-13/HU-018
const ROLES_VER = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']

async function generarNumeroRelease(ocaId: string, numeroOca: string): Promise<string> {
  const { data, error } = await adminClient().rpc('siguiente_numero_release', { p_oca_id: ocaId })
  if (error || data === null) throw new Error('Error al generar número de release')
  return `${numeroOca}-R${String(data).padStart(3, '0')}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_GENERAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params

    const { data: oca, error: errorOca } = await adminClient()
      .from('oca').select('id, numero_oca, estado, tipo, presupuesto_total').eq('id', id).single()
    if (errorOca || !oca) return NextResponse.json({ error: 'OCA no encontrada' }, { status: 404 })

    // Spec: RN-03 — solo se generan releases contra una OCA vigente
    if (!ESTADOS_OCA_ACTIVA.includes(oca.estado)) {
      return NextResponse.json({ error: 'Solo se puede generar un release contra una OCA vigente' }, { status: 409 })
    }

    const body = await req.json()
    const areaId: string | undefined = body.area_id
    if (!areaId) return NextResponse.json({ error: 'El centro de costo (área) es requerido' }, { status: 400 })

    // Spec: RN-06 — el centro de costo debe estar habilitado en la OCA
    const { data: areaHabilitada } = await adminClient()
      .from('oca_areas_habilitadas').select('id').eq('oca_id', id).eq('area_id', areaId).maybeSingle()
    if (!areaHabilitada) {
      return NextResponse.json({ error: 'El centro de costo no está habilitado para esta OCA' }, { status: 400 })
    }

    const items: ReleaseItemInput[] = body.items ?? []
    const { data: catalogo } = await adminClient()
      .from('oca_items').select('id, codigo, descripcion, unidad, precio_unitario, precio_maximo').eq('oca_id', id)

    const resultado = validarGenerarRelease(oca.tipo, items, catalogo ?? [])
    if ('error' in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: 400 })
    }
    const { itemsValidados, monto_total } = resultado

    // Spec: CA-03 — informativo, no bloquea (RN-04: el chequeo que bloquea es en resolver)
    const consumidoActual = await calcularPresupuestoConsumido(id)
    const disponible_antes = Number(oca.presupuesto_total) - consumidoActual
    const disponible_despues = disponible_antes - monto_total

    const numero_release = await generarNumeroRelease(id, oca.numero_oca)

    // Spec: RN-02 — se resuelve y persiste al generar (snapshot), mismo
    // patrón que notas_pedido.aprobador_asignado_id de SC-002.
    const aprobadorAsignadoId = await calcularAprobadorAsignado(areaId)

    const { data: release, error: errorInsert } = await adminClient()
      .from('oca_releases')
      .insert({
        numero_release,
        oca_id: id,
        area_id: areaId,
        aprobador_asignado_id: aprobadorAsignadoId,
        solicitante_id: user.id,
        monto_total,
        observaciones: body.observaciones ?? null,
      })
      .select('id, numero_release, estado')
      .single()

    if (errorInsert || !release) {
      return NextResponse.json({ error: errorInsert?.message ?? 'Error al generar el release' }, { status: 500 })
    }

    await adminClient().from('oca_release_items').insert(
      itemsValidados.map(it => ({
        release_id: release.id,
        oca_item_id: it.oca_item_id,
        codigo: it.codigo,
        descripcion: it.descripcion,
        unidad: it.unidad,
        precio_unitario: it.precio_unitario_final,
        cantidad: it.cantidad,
        subtotal: it.subtotal,
      }))
    )

    await adminClient().from('historial_oca').insert({
      oca_id: id,
      estado: oca.estado,
      actor_email: user.email,
      actor_nombre: perfil.rol,
      notas: `Release ${numero_release} generado por ${monto_total}`,
    })

    await registrarAuditoria({ accion: 'generar_release_oca', entidad: 'oca_release', entidad_id: release.id, referencia: numero_release })

    return NextResponse.json({
      id: release.id, numero_release: release.numero_release, estado: release.estado,
      monto_total, disponible_antes, disponible_despues,
    }, { status: 201 })
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

    const { data: releases, error } = await adminClient()
      .from('oca_releases').select('*').eq('oca_id', id).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(releases ?? [])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
