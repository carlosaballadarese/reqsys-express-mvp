import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-009 RN-02
const ESTADOS_ACTIVOS_SLA = ['en_gestion', 'oc_directa']

// Spec: HU-009 CA-09/CA-10 — plazo aplicado por Prioridad (límite superior del rango)
// Exportado (HU-011) para que el cálculo en lote no duplique esta tabla de datos.
export const PLAZOS: Record<string, { valor: number; unidad: 'horas' | 'dias_habiles' }> = {
  excepcional: { valor: 24, unidad: 'horas' },
  alta: { valor: 3, unidad: 'dias_habiles' },
  media: { valor: 15, unidad: 'dias_habiles' },
  baja: { valor: 30, unidad: 'dias_habiles' },
}

// Spec: HU-009 CA-09 — lunes a viernes, excluyendo feriados registrados.
// Nota de implementación: el cálculo de "día hábil" se hace en UTC, no en la
// zona horaria local de Ecuador (UTC-5). Es una simplificación deliberada para
// que el resultado sea determinista sin importar el huso horario del servidor;
// introduce una imprecisión de hasta unas horas alrededor de la medianoche
// (una NP asignada a las 20:00 hora Ecuador del lunes podría contarse desde el
// martes en UTC). Aceptable para v1 — ver Notas de implementación de la Tarea 4.
export async function esDiaHabil(fecha: Date): Promise<boolean> {
  const dia = fecha.getUTCDay()
  if (dia === 0 || dia === 6) return false

  const fechaStr = fecha.toISOString().slice(0, 10)
  const { data } = await adminClient()
    .from('feriados')
    .select('id')
    .eq('fecha', fechaStr)
    .maybeSingle()

  return !data
}

export async function diasHabilesEntre(desde: Date, hasta: Date): Promise<number> {
  if (hasta <= desde) return 0

  const inicio = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()))
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()))

  let dias = 0
  const cursor = new Date(inicio)
  while (cursor < fin) {
    if (await esDiaHabil(cursor)) dias++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
}

// Spec: HU-011 — cálculo de SLA en lote (Vista por NP). Trae todos los feriados
// del rango en una sola consulta, en vez de una consulta por día como esDiaHabil().
// Aditivo: no reemplaza esDiaHabil/diasHabilesEntre/calcularSLA, que siguen usándose
// tal cual en el detalle de NP (una sola fila, costo aceptable).
export async function obtenerFeriadosEnRango(desde: Date, hasta: Date): Promise<Set<string>> {
  const { data } = await adminClient()
    .from('feriados')
    .select('fecha')
    .gte('fecha', desde.toISOString().slice(0, 10))
    .lte('fecha', hasta.toISOString().slice(0, 10))

  return new Set((data ?? []).map((f: { fecha: string }) => f.fecha))
}

function esDiaHabilSync(fecha: Date, feriados: Set<string>): boolean {
  const dia = fecha.getUTCDay()
  if (dia === 0 || dia === 6) return false
  return !feriados.has(fecha.toISOString().slice(0, 10))
}

// Spec: HU-011 — misma lógica que diasHabilesEntre(), pero síncrona: recibe el
// set de feriados ya cargado en vez de consultar la BD por cada día del bucle.
export function diasHabilesEntreSync(desde: Date, hasta: Date, feriados: Set<string>): number {
  if (hasta <= desde) return 0

  const inicio = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()))
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()))

  let dias = 0
  const cursor = new Date(inicio)
  while (cursor < fin) {
    if (esDiaHabilSync(cursor, feriados)) dias++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
}

export type SlaTranscurrido = { transcurridoMs: number; plazoMs: number; unidad: 'horas' | 'dias_habiles' }

// Spec: HU-011 — misma aritmética que calcularSLA() (transcurrido vs. plazo), pero
// síncrona y en lote: recibe el set de feriados ya cargado en vez de consultar la
// BD. No reemplaza calcularSLA(); pensada para cuando ya se tienen muchas NPs en
// memoria (Vista por NP) y los feriados del rango completo precargados una sola vez.
export function calcularTranscurridoLote(params: {
  prioridad: string
  slaIniciadoEn: string
  slaPausadoDesde: string | null
  slaPausadoAcumuladoSeg: number | null
  feriados: Set<string>
  ahora?: Date
}): SlaTranscurrido {
  const { prioridad, slaIniciadoEn, slaPausadoDesde, slaPausadoAcumuladoSeg, feriados, ahora } = params
  const plazo = PLAZOS[prioridad]
  const inicio = new Date(slaIniciadoEn)
  const momentoFin = slaPausadoDesde ? new Date(slaPausadoDesde) : (ahora ?? new Date())
  const pausadoSeg = slaPausadoAcumuladoSeg ?? 0

  let transcurridoMs: number
  if (plazo.unidad === 'horas') {
    transcurridoMs = (momentoFin.getTime() - inicio.getTime()) - pausadoSeg * 1000
  } else {
    const diasHabiles = diasHabilesEntreSync(inicio, momentoFin, feriados)
    transcurridoMs = diasHabiles * 24 * 60 * 60 * 1000 - pausadoSeg * 1000
  }
  transcurridoMs = Math.max(0, transcurridoMs)

  const plazoMs = plazo.unidad === 'horas'
    ? plazo.valor * 60 * 60 * 1000
    : plazo.valor * 24 * 60 * 60 * 1000

  return { transcurridoMs, plazoMs, unidad: plazo.unidad }
}

export type SlaResultado = {
  transcurrido_ms: number
  plazo_ms: number
  vencido: boolean
  activo: boolean
  unidad: 'horas' | 'dias_habiles'
}

// Spec: HU-009 CA-09, RN-02
// null si la NP nunca inició SLA (sla_iniciado_en es NULL — aún no asignada).
export async function calcularSLA(np_id: string): Promise<SlaResultado | null> {
  const { data: np } = await adminClient()
    .from('notas_pedido')
    .select('estado, prioridad, sla_iniciado_en, sla_pausado_desde, sla_pausado_acumulado_seg')
    .eq('id', np_id)
    .single()

  if (!np || !np.sla_iniciado_en) return null

  const inicio = new Date(np.sla_iniciado_en)
  // Spec: RN-02 — si está pausado, el momento de fin queda congelado en el instante de la pausa
  const momentoFin = np.sla_pausado_desde ? new Date(np.sla_pausado_desde) : new Date()
  const pausadoSeg = np.sla_pausado_acumulado_seg ?? 0
  const plazo = PLAZOS[np.prioridad as string]

  let transcurridoMs: number
  if (plazo.unidad === 'horas') {
    transcurridoMs = (momentoFin.getTime() - inicio.getTime()) - pausadoSeg * 1000
  } else {
    const diasHabiles = await diasHabilesEntre(inicio, momentoFin)
    transcurridoMs = diasHabiles * 24 * 60 * 60 * 1000 - pausadoSeg * 1000
  }
  transcurridoMs = Math.max(0, transcurridoMs)

  const plazoMs = plazo.unidad === 'horas'
    ? plazo.valor * 60 * 60 * 1000
    : plazo.valor * 24 * 60 * 60 * 1000

  return {
    transcurrido_ms: transcurridoMs,
    plazo_ms: plazoMs,
    vencido: transcurridoMs > plazoMs,
    activo: ESTADOS_ACTIVOS_SLA.includes(np.estado),
    unidad: plazo.unidad,
  }
}
