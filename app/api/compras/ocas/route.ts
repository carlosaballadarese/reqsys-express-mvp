import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { actualizarEstadoOca } from '@/lib/oca-estado'

// Spec: HU-018 RN-01 — solo compras/admin crean OCA
const ROLES_CREAR = ['compras', 'admin']
// Spec: HU-018 CA-12 — listado visible para todos los roles (incluye
// solicitante/bodega porque podrán generar releases en la Fase D futura)
const ROLES_LISTAR = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']

type ItemInput = {
  codigo: string
  descripcion: string
  unidad: string
  categoria?: string
  precio_unitario?: number
  precio_maximo?: number
}

async function generarNumeroOca(): Promise<string> {
  const year = new Date().getFullYear()
  const { data, error } = await adminClient().rpc('siguiente_numero_oca', { p_year: year })
  if (error || data === null) throw new Error('Error al generar número de OCA')
  return `OCA-${year}-${String(data).padStart(4, '0')}`
}

// Spec: HU-018 RN-03, RN-04, RN-05 — validaciones compartidas por POST y PUT
function validarCabeceraEItems(body: {
  tipo?: string
  fecha_inicio?: string
  fecha_fin?: string
  presupuesto_total?: number
  items?: ItemInput[]
}): string | null {
  if (!['precio_fijo', 'precio_variable_tope'].includes(body.tipo ?? '')) {
    return 'Tipo de OCA inválido'
  }
  if (!body.fecha_inicio || !body.fecha_fin || new Date(body.fecha_fin) <= new Date(body.fecha_inicio)) {
    return 'La fecha de fin debe ser posterior a la fecha de inicio'
  }
  if (!body.presupuesto_total || body.presupuesto_total <= 0) {
    return 'El presupuesto total debe ser un monto positivo'
  }
  for (const item of body.items ?? []) {
    if (body.tipo === 'precio_fijo' && (item.precio_unitario === undefined || item.precio_unitario === null)) {
      return `El ítem ${item.codigo} requiere precio_unitario (tipo precio_fijo)`
    }
    if (body.tipo === 'precio_variable_tope' && (item.precio_maximo === undefined || item.precio_maximo === null)) {
      return `El ítem ${item.codigo} requiere precio_maximo (tipo precio_variable_tope)`
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_CREAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await req.json()
    const errorValidacion = validarCabeceraEItems(body)
    if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 })

    const numero_oca = await generarNumeroOca()

    const { data: oca, error: errorOca } = await adminClient()
      .from('oca')
      .insert({
        numero_oca,
        proveedor_id: body.proveedor_id,
        tipo: body.tipo,
        descripcion: body.descripcion,
        fecha_inicio: body.fecha_inicio,
        fecha_fin: body.fecha_fin,
        presupuesto_total: body.presupuesto_total,
        referencia_contractual: body.referencia_contractual,
        creado_por_id: user.id,
      })
      .select('id, numero_oca, estado')
      .single()

    if (errorOca || !oca) {
      return NextResponse.json({ error: errorOca?.message ?? 'Error al crear la OCA' }, { status: 500 })
    }

    const items: ItemInput[] = body.items ?? []
    if (items.length > 0) {
      await adminClient().from('oca_items').insert(
        items.map(it => ({
          oca_id: oca.id,
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          categoria: it.categoria ?? null,
          precio_unitario: it.precio_unitario ?? null,
          precio_maximo: it.precio_maximo ?? null,
        }))
      )
    }

    const areasHabilitadas: string[] = body.areas_habilitadas ?? []
    if (areasHabilitadas.length > 0) {
      await adminClient().from('oca_areas_habilitadas').insert(
        areasHabilitadas.map(area_id => ({ oca_id: oca.id, area_id }))
      )
    }

    await adminClient().from('historial_oca').insert({
      oca_id: oca.id,
      estado: 'borrador',
      actor_email: user.email,
      actor_nombre: perfil.rol,
      notas: 'OCA creada',
    })

    await registrarAuditoria({ accion: 'crear_oca', entidad: 'oca', entidad_id: oca.id, referencia: numero_oca })

    return NextResponse.json({ id: oca.id, numero_oca: oca.numero_oca, estado: oca.estado }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_LISTAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado')
    const proveedor_id = searchParams.get('proveedor_id')
    const tipo = searchParams.get('tipo')

    let query = adminClient().from('oca').select('*').order('created_at', { ascending: false })
    if (estado) query = query.eq('estado', estado)
    if (proveedor_id) query = query.eq('proveedor_id', proveedor_id)
    if (tipo) query = query.eq('tipo', tipo)

    const { data: ocas, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Spec: HU-018 CA-08/CA-09 — derivación en caliente antes de responder
    await Promise.all((ocas ?? []).filter(o => o.estado === 'vigente').map(o => actualizarEstadoOca(o.id)))

    const proveedorIds = [...new Set((ocas ?? []).map(o => o.proveedor_id))]
    const { data: proveedores } = proveedorIds.length > 0
      ? await adminClient().from('proveedores').select('id, nombre').in('id', proveedorIds)
      : { data: [] as { id: string; nombre: string }[] }
    const nombrePorProveedor: Record<string, string> = {}
    for (const p of proveedores ?? []) nombrePorProveedor[p.id] = p.nombre

    const ocaIds = (ocas ?? []).map(o => o.id)
    const { data: ocasActualizadas } = ocaIds.length > 0
      ? await adminClient().from('oca').select('*').in('id', ocaIds)
      : { data: ocas }
    const estadoActualPorId: Record<string, string> = {}
    for (const o of ocasActualizadas ?? []) estadoActualPorId[o.id] = o.estado

    const resultado = (ocas ?? []).map(o => {
      const consumido = 0 // Spec: HU-018 CA-09 — placeholder hasta Fase D (Releases)
      const disponible = Number(o.presupuesto_total) - consumido
      const porcentaje_ejecucion = Number(o.presupuesto_total) > 0
        ? Math.round((consumido / Number(o.presupuesto_total)) * 100)
        : 0
      return {
        id: o.id,
        numero_oca: o.numero_oca,
        proveedor_id: o.proveedor_id,
        proveedor_nombre: nombrePorProveedor[o.proveedor_id] ?? null,
        tipo: o.tipo,
        fecha_inicio: o.fecha_inicio,
        fecha_fin: o.fecha_fin,
        presupuesto_total: o.presupuesto_total,
        consumido,
        disponible,
        porcentaje_ejecucion,
        estado: estadoActualPorId[o.id] ?? o.estado,
      }
    })

    return NextResponse.json(resultado)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
