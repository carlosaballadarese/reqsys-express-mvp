const ROLES_CON_PRECIO = ['compras', 'admin', 'asistente_compras']

// Spec CA-06: controla la RESPUESTA API — masking de precio_unitario y total_estimado
export function puedeVerPrecioNP(
  rol: string,
  npEsRegularizacion: boolean,
  npCreadoPorId: string | null,
  userId: string | null
): boolean {
  if (ROLES_CON_PRECIO.includes(rol)) return true
  return npEsRegularizacion && userId !== null && userId === npCreadoPorId
}

// Spec CA-13: controla el GUARDADO en BD — precio real vs 0
export function puedeGuardarPrecioNP(
  rol: string,
  esRegularizacion: boolean
): boolean {
  return ROLES_CON_PRECIO.includes(rol) || esRegularizacion
}
