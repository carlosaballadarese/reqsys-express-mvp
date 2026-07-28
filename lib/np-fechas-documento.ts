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
