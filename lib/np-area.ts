import { adminClient } from '@/lib/supabase/clients'

// Spec: SC-002 — separa la identidad del área (tabla `areas`) de la asignación
// de aprobador (`coordinadores_area`, ahora referenciando `area_id`). Este módulo
// concentra toda la lógica de resolución de aprobador — ningún endpoint debe
// re-derivarla por su cuenta (RN-02).

export type AprobadorResuelto = {
  id:     string
  nombre: string
  email:  string
}

// Estados terminales de una NP — a efectos de "dependencia activa" de un
// coordinador (RN-08), cualquier otro estado cuenta como NP viva.
const ESTADOS_NP_TERMINALES = ['completada', 'rechazada', 'cancelada']

// Coordinador activo cuyo area_id coincide con el área dada — el aprobador
// "natural" de esa área. null si el área no tiene ningún coordinador activo
// asignado (CA-13: no bloquea el guardado de un borrador, solo el envío a
// aprobación — ese chequeo lo hace el caller).
export async function resolverAprobadorPorDefecto(areaId: string): Promise<AprobadorResuelto | null> {
  const { data } = await adminClient()
    .from('coordinadores_area')
    .select('id, nombre, email')
    .eq('area_id', areaId)
    .eq('activo', true)
    .limit(1)

  return data?.[0] ?? null
}

// Coordinadores activos registrados como alternativos de esta área (RN-03).
// Vacío si el área no tiene ninguno — el formulario de NP no debe mostrar
// selector de aprobador en ese caso (CA-03).
export async function listarAlternativosActivos(areaId: string): Promise<AprobadorResuelto[]> {
  const { data: alternativos } = await adminClient()
    .from('area_aprobadores_alternativos')
    .select('coordinador_id')
    .eq('area_id', areaId)

  const coordinadorIds = (alternativos ?? []).map(a => a.coordinador_id)
  if (coordinadorIds.length === 0) return []

  const { data: coordinadores } = await adminClient()
    .from('coordinadores_area')
    .select('id, nombre, email')
    .in('id', coordinadorIds)
    .eq('activo', true)

  return coordinadores ?? []
}

// Resuelve el aprobador_asignado_id final para una NP puntual (RN-02/RN-04).
// - Sin coordinadorElegidoId → usa el default del área.
// - Con coordinadorElegidoId válido (es el default, o un alternativo activo
//   de esa área) → se respeta.
// - Con coordinadorElegidoId inválido (de otra área, inactivo, o ya no es
//   alternativo) → se ignora silenciosamente y cae al default — nunca se
//   persiste un aprobador que no corresponde al área actual.
// - Sin ningún coordinador activo para el área → null (CA-13).
export async function calcularAprobadorAsignado(
  areaId: string,
  coordinadorElegidoId?: string | null
): Promise<string | null> {
  const [defaultAprobador, alternativos] = await Promise.all([
    resolverAprobadorPorDefecto(areaId),
    listarAlternativosActivos(areaId),
  ])

  if (coordinadorElegidoId) {
    const esDefault = defaultAprobador?.id === coordinadorElegidoId
    const esAlternativoValido = alternativos.some(a => a.id === coordinadorElegidoId)
    if (esDefault || esAlternativoValido) return coordinadorElegidoId
  }

  return defaultAprobador?.id ?? null
}

export type AreaResuelta = { id: string; nombre: string }

// Spec: SC-002 — no hay un CRUD dedicado de `areas` en esta SC (el catálogo se
// puebla por backfill desde coordinadores_area.area existentes). Para no dejar
// al admin sin forma de registrar un coordinador de un área nueva, el alta de
// coordinador acepta area_id (existente, activa) o area_nombre (crea la fila si
// no existe — reutiliza la existente si el nombre ya está registrado).
export async function resolverOCrearArea(
  input: { area_id?: string | null; area_nombre?: string | null }
): Promise<AreaResuelta | null> {
  if (input.area_id) {
    const { data } = await adminClient()
      .from('areas')
      .select('id, nombre')
      .eq('id', input.area_id)
      .eq('activo', true)
      .maybeSingle()
    return data ?? null
  }

  const nombre = input.area_nombre?.trim()
  if (!nombre) return null

  const { data: existente } = await adminClient()
    .from('areas')
    .select('id, nombre')
    .eq('nombre', nombre)
    .maybeSingle()
  if (existente) return existente

  const { data: creada } = await adminClient()
    .from('areas')
    .insert({ nombre })
    .select('id, nombre')
    .single()
  return creada ?? null
}

export type DependenciasCoordinador = {
  bloqueado: boolean
  motivos:   string[]
}

// Dependencias activas que impiden un DELETE físico de un coordinador (RN-08).
// Desactivarlo (coordinadores_area.activo = false) siempre es posible y no
// requiere este chequeo — solo el borrado físico lo exige.
export async function verificarDependenciasActivasCoordinador(
  coordinadorId: string
): Promise<DependenciasCoordinador> {
  const motivos: string[] = []

  const { data: coordinador } = await adminClient()
    .from('coordinadores_area')
    .select('area_id')
    .eq('id', coordinadorId)
    .maybeSingle()

  if (coordinador?.area_id) {
    const { data: area } = await adminClient()
      .from('areas')
      .select('activo')
      .eq('id', coordinador.area_id)
      .maybeSingle()
    if (area?.activo) {
      motivos.push('Es el aprobador por defecto de un área activa')
    }
  }

  const { count: npsVivasCount } = await adminClient()
    .from('notas_pedido')
    .select('id', { count: 'exact', head: true })
    .eq('aprobador_asignado_id', coordinadorId)
    .not('estado', 'in', `(${ESTADOS_NP_TERMINALES.map(e => `"${e}"`).join(',')})`)

  if ((npsVivasCount ?? 0) > 0) {
    motivos.push('Es el aprobador asignado de al menos una Nota de Pedido activa')
  }

  const { count: alternativosCount } = await adminClient()
    .from('area_aprobadores_alternativos')
    .select('id', { count: 'exact', head: true })
    .eq('coordinador_id', coordinadorId)

  if ((alternativosCount ?? 0) > 0) {
    motivos.push('Está registrado como aprobador alternativo de al menos un área')
  }

  return { bloqueado: motivos.length > 0, motivos }
}
