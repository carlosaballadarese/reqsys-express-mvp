import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-021 RN-02 — reutilizable, usada por el resolver y por anular (a
// diferencia del chequeo inline de roles de HU-020, acá son 2 consultas a BD
// con la misma lógica exacta en 2 endpoints). Mismo patrón que la variable
// esCoordinadorDelArea de PATCH /api/compras/nps/[id]: matchea el email de la
// sesión contra coordinadores_area.email de la fila resuelta como aprobador.
export async function esAutorizadoParaResolverRelease(
  perfilRol: string,
  perfilEmail: string,
  aprobadorAsignadoId: string | null
): Promise<boolean> {
  if (['compras', 'admin'].includes(perfilRol)) return true
  if (!aprobadorAsignadoId) return false

  const { data: coord } = await adminClient()
    .from('coordinadores_area')
    .select('email')
    .eq('id', aprobadorAsignadoId)
    .eq('email', perfilEmail)
    .eq('activo', true)
    .maybeSingle()

  return !!coord
}
