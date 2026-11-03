// Spec: cierre de sesión por tiempo (timebox/inactividad) — Supabase Free no
// soporta `[auth.sessions] timebox/inactivity_timeout` nativo (feature de
// Pro Plan, confirmado en el Dashboard: "User Sessions... Pro Plan and
// above"). Implementado a nivel de aplicación en proxy.ts, reutilizando
// estas funciones puras testeables sin mockear Supabase ni NextRequest.

export const SESSION_TIMEBOX_HORAS = 24
export const SESSION_INACTIVIDAD_HORAS = 8

export const ULTIMA_ACTIVIDAD_COOKIE = 'reqsys_ultima_actividad'

const MS_POR_HORA = 60 * 60 * 1000

// Fuerza re-login 24h después del último login real. Se basa en
// `user.last_sign_in_at` (Supabase Auth), que solo cambia en un login
// nuevo — la rotación del refresh token en cada request NO lo actualiza,
// así que no reinicia el timebox por el solo hecho de seguir activo.
export function excedeTimebox(lastSignInAt: string, ahora: Date = new Date()): boolean {
  const transcurridoMs = ahora.getTime() - new Date(lastSignInAt).getTime()
  return transcurridoMs > SESSION_TIMEBOX_HORAS * MS_POR_HORA
}

// Fuerza re-login tras 8h sin actividad real (sin ninguna request
// autenticada de por medio). `ultimaActividadMs` es `null` en la primera
// request tras el login (todavía no existe la cookie) — nunca se considera
// excedida en ese caso, la cookie recién se setea ahí.
export function excedeInactividad(ultimaActividadMs: number | null, ahora: Date = new Date()): boolean {
  if (ultimaActividadMs === null) return false
  return ahora.getTime() - ultimaActividadMs > SESSION_INACTIVIDAD_HORAS * MS_POR_HORA
}
