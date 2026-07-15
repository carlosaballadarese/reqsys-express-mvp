import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient, anonClient } from '@/lib/supabase/clients'
import { puedeVerPrecioNP, puedeGuardarPrecioNP } from '@/lib/np-precio'
import { enviarNPACoordinador } from '@/lib/np-notificacion'


async function generarNumeroNP(): Promise<string> {
  const year = new Date().getFullYear()
  const { data, error } = await adminClient().rpc('siguiente_numero_np', { p_year: year })
  if (error || data === null) throw new Error('Error al generar número de NP')
  return `NP-${year}-${String(data).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfilCreador } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    const rol = perfilCreador?.rol ?? ''

    const body = await req.json()
    const { encabezado, items } = body
    // Spec: HU-009 CA-01/CA-13 — 'enviar' es el comportamiento por defecto (compatibilidad
    // con el flujo actual); 'borrador' guarda sin enviar email ni pasar por 'pendiente'.
    const accion: 'borrador' | 'enviar' = body.accion === 'borrador' ? 'borrador' : 'enviar'

    // Spec CA-02: Prioridad es obligatoria al crear la NP
    const PRIORIDADES_VALIDAS = ['excepcional', 'alta', 'media', 'baja']
    if (!PRIORIDADES_VALIDAS.includes(encabezado?.prioridad)) {
      return NextResponse.json({ error: 'Prioridad es obligatoria' }, { status: 400 })
    }

    // Spec CA-01 / RN-03: validar campos obligatorios de regularización
    const esRegularizacion = encabezado.es_regularizacion === true
    if (esRegularizacion) {
      if (!encabezado.fecha_provision || !encabezado.proveedor_regularizacion_nombre) {
        return NextResponse.json(
          { error: 'campos_regularizacion_requeridos: fecha_provision y proveedor son obligatorios' },
          { status: 400 }
        )
      }
    }

    // Spec: HU-009 CA-01 — un Borrador no requiere coordinador todavía (se
    // valida recién al enviar, en /api/compras/nps/[id]/enviar-aprobacion).
    if (accion === 'enviar') {
      const { data: coordinador, error: errorCoord } = await anonClient()
        .from('coordinadores_area')
        .select('nombre, email')
        .eq('area', encabezado.area)
        .single()

      if (errorCoord || !coordinador) {
        return NextResponse.json(
          { error: 'No se encontró coordinador para el área seleccionada' },
          { status: 400 }
        )
      }
    }

    // Spec CA-13: guardar precio real si es regularización, sin importar el rol
    const guardarPrecio = puedeGuardarPrecioNP(rol, esRegularizacion)

    // 2. Calcular total estimado
    const totalEstimado = guardarPrecio
      ? items.reduce(
          (acc: number, item: { cantidad: number; precio_unitario: number }) =>
            acc + item.cantidad * (item.precio_unitario || 0),
          0
        )
      : 0

    // 3. Insertar NP
    const numero = await generarNumeroNP()
    const { data: np, error: errorNP } = await adminClient()
      .from('notas_pedido')
      .insert({
        numero,
        // Spec: HU-009 CA-01 — Borrador no dispara el flujo de aprobación
        estado:              accion === 'borrador' ? 'borrador' : 'pendiente',
        creado_por_id:      user.id,
        solicitante_nombre: encabezado.solicitante_nombre,
        solicitante_email:  encabezado.solicitante_email,
        area:               encabezado.area,
        prioridad:          encabezado.prioridad,
        tipo_compra:        encabezado.tipo_compra,
        centro_costo:       encabezado.centro_costo,
        descripcion_general: encabezado.descripcion_general,
        total_estimado:     totalEstimado,
        // Spec CA-05: campos de regularización
        es_regularizacion:                     esRegularizacion,
        fecha_provision:                       esRegularizacion ? (encabezado.fecha_provision ?? null) : null,
        proveedor_regularizacion_nombre:       esRegularizacion ? (encabezado.proveedor_regularizacion_nombre ?? null) : null,
        proveedor_regularizacion_identificacion: esRegularizacion ? (encabezado.proveedor_regularizacion_identificacion ?? null) : null,
      })
      .select()
      .single()

    if (errorNP || !np) {
      return NextResponse.json({ error: 'Error al guardar la NP' }, { status: 500 })
    }

    // 4. Insertar ítems
    const itemsConNP = items.map((item: {
      codigo: string
      descripcion: string
      unidad: string
      cantidad: number
      precio_unitario: number
      proveedor_sugerido?: string
      fecha_requerida?: string
    }, index: number) => ({
      nota_pedido_id:     np.id,
      linea:              index + 1,
      codigo:             item.codigo || null,
      descripcion:        item.descripcion,
      unidad:             item.unidad,
      cantidad:           item.cantidad,
      // Spec CA-13: precio real si es regularización o rol con permiso
      precio_unitario:    guardarPrecio ? (item.precio_unitario || 0) : 0,
      proveedor_sugerido: item.proveedor_sugerido || null,
      // Spec CA-05: fecha requerida por ítem (opcional)
      fecha_requerida:    item.fecha_requerida || null,
    }))

    const { error: errorItems } = await anonClient().from('items_np').insert(itemsConNP)

    if (errorItems) {
      return NextResponse.json({ error: 'Error al guardar los ítems' }, { status: 500 })
    }

    if (accion === 'borrador') {
      // Spec: HU-009 CA-01/CA-16 — historial + auditoría, sin email ni coordinador
      await adminClient().from('historial_np').insert({
        np_id: np.id,
        estado: 'borrador',
        actor_email: encabezado.solicitante_email,
        actor_nombre: encabezado.solicitante_nombre,
        notas: 'NP guardada como borrador',
      })
    } else {
      // Spec: HU-009 — reutiliza el helper compartido con enviar-aprobacion/route.ts
      await enviarNPACoordinador(np.id, numero, encabezado, items, totalEstimado)
    }

    return NextResponse.json({ success: true, numero, id: np.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const estado  = searchParams.get('estado')
    const area    = searchParams.get('area')
    const q       = searchParams.get('q')?.trim()

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let emailFiltro:    string | null   = null
    let areasFiltro:    string[] | null = null
    let asistenteId:    string | null   = null
    let asistenteEmail: string | null   = null
    let rolActual:      string          = ''

    if (user) {
      const { data: perfil } = await adminClient()
        .from('perfiles')
        .select('rol, email')
        .eq('id', user.id)
        .single()

      rolActual = perfil?.rol ?? ''

      if (perfil?.rol === 'solicitante') {
        emailFiltro = perfil.email
      }

      if (perfil?.rol === 'coordinador') {
        const { data: coords } = await adminClient()
          .from('coordinadores_area')
          .select('area')
          .eq('email', perfil.email)
        areasFiltro = coords?.map(c => c.area) ?? []
      }

      if (perfil?.rol === 'asistente_compras') {
        asistenteId    = user.id
        asistenteEmail = perfil.email
      }
    }

    // Spec CA-06: SELECT incluye es_regularizacion y creado_por_id para masking por fila
    const SELECT = 'id, numero, solicitante_nombre, solicitante_email, area, prioridad, tipo_compra, centro_costo, estado, total_estimado, convertida, created_at, descripcion_general, asignado_a, asignado_nombre, asignado_email, es_regularizacion, creado_por_id'

    let query = adminClient()
      .from('notas_pedido')
      .select(SELECT)
      .order('created_at', { ascending: false })

    if (emailFiltro) {
      query = query.or(`creado_por_id.eq.${user!.id},solicitante_email.eq.${emailFiltro}`)
    }
    if (areasFiltro !== null) {
      if (areasFiltro.length === 0) {
        query = query.eq('creado_por_id', user!.id)
      } else {
        query = query.or(`area.in.(${areasFiltro.join(',')}),creado_por_id.eq.${user!.id}`)
      }
    }

    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    if (area   && area   !== 'todas') query = query.eq('area', area)
    if (q) query = query.or(`numero.ilike.%${q}%,solicitante_nombre.ilike.%${q}%`)

    // Spec: HU-009 CA-15 — un Borrador es visible únicamente para su creador,
    // sin importar el rol (incluso compras/admin, que normalmente ven todas las NPs).
    query = user
      ? query.or(`estado.neq.borrador,creado_por_id.eq.${user.id}`)
      : query.neq('estado', 'borrador')

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Spec CA-06: masking por fila — puedeVerPrecioNP determina si total_estimado se expone
    let resultado: any[] = (data ?? []).map((np: any) => {
      const verPrecio = puedeVerPrecioNP(rolActual, np.es_regularizacion ?? false, np.creado_por_id, user?.id ?? null)
      return verPrecio ? np : { ...np, total_estimado: null }
    })

    // Enriquecer con origen para asistente_compras
    if (asistenteId) {
      resultado = resultado.map((np: any) => ({
        ...np,
        origen: np.asignado_a === asistenteId
          ? 'asignada'
          : (np.solicitante_email === asistenteEmail ? 'propia' : null),
      }))
    }

    return NextResponse.json(resultado)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
