import { adminClient } from '@/lib/supabase/clients'
import { ROL_LABEL } from '@/lib/roles'

// Spec: SC-001 RN-03 — fecha del evento 'aprobada' más reciente en historial_np
// (si la NP fue devuelta y reenviada, se toma la aprobación vigente, no la
// primera). Retorna null si la NP nunca fue aprobada (CA-05b).
export async function obtenerFechaAprobacionNP(npId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('historial_np')
    .select('fecha')
    .eq('np_id', npId)
    .eq('estado', 'aprobada')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.fecha ?? null
}

const LOTE_FECHAS = 100

// Spec: SC-007 decisión de diseño #1 — versión en lote de obtenerFechaAprobacionNP(),
// evita un N+1 real sobre historial_np cuando el reporte se ejecuta sin filtros
// (potencialmente cientos de NPs). Mismo patrón de lotes de 100 ya usado en
// HU-016/HU-021/SC-002 para no exceder el límite de URI de PostgREST/Kong.
export async function obtenerFechasAprobacionNPBulk(npIds: string[]): Promise<Map<string, string | null>> {
  const resultado = new Map<string, string | null>(npIds.map(id => [id, null]))
  if (npIds.length === 0) return resultado

  for (let i = 0; i < npIds.length; i += LOTE_FECHAS) {
    const lote = npIds.slice(i, i + LOTE_FECHAS)
    const { data } = await adminClient()
      .from('historial_np')
      .select('np_id, fecha')
      .in('np_id', lote)
      .eq('estado', 'aprobada')
      .order('fecha', { ascending: false })

    for (const fila of (data ?? []) as { np_id: string; fecha: string }[]) {
      // ya ordenado desc por fecha — la primera vez que aparece un np_id es la más reciente
      if (resultado.get(fila.np_id) === null) resultado.set(fila.np_id, fila.fecha)
    }
  }

  return resultado
}

// Spec: SC-001 §2.2 — rol real del solicitante, resuelto en vivo (no snapshot),
// traducido con ROL_LABEL. Fallback creado_por_id -> solicitante_email, mismo
// criterio que GET /api/compras/nps.
export async function obtenerRolSolicitante(
  np: { creado_por_id: string | null; solicitante_email: string }
): Promise<string | null> {
  let rol: string | null = null

  if (np.creado_por_id) {
    const { data } = await adminClient()
      .from('perfiles').select('rol').eq('id', np.creado_por_id).maybeSingle()
    rol = data?.rol ?? null
  }

  if (!rol && np.solicitante_email) {
    const { data } = await adminClient()
      .from('perfiles').select('rol').eq('email', np.solicitante_email).maybeSingle()
    rol = data?.rol ?? null
  }

  return rol ? (ROL_LABEL[rol] ?? rol) : null
}

// Spec: preview del aprobador asignado antes de que exista una aprobación real
// — distinto del snapshot aprobador_np_nombre/aprobador_np_area (que solo se
// llena al aprobar). Se muestra en el PDF/Excel de la NP solo mientras está
// pendiente, ya que aprobador_asignado_id puede ser un override (SC-002) que
// no es deducible por el área.
export async function obtenerAprobadorPendiente(
  aprobadorAsignadoId: string | null
): Promise<{ nombre: string; area: string } | null> {
  if (!aprobadorAsignadoId) return null

  const { data } = await adminClient()
    .from('coordinadores_area')
    .select('nombre, area')
    .eq('id', aprobadorAsignadoId)
    .maybeSingle()

  return data ? { nombre: data.nombre, area: data.area } : null
}
