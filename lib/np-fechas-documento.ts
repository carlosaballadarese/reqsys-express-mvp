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
