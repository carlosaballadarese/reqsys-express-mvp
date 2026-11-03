export function validarRucEcuador(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false
  const provincia = parseInt(ruc.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false
  const tercer = parseInt(ruc[2], 10)
  return tercer <= 6 || tercer === 9
}

// Spec: SC-006 RN-02 — validarPassword() compartida entre cambiar-password y recuperar-password
export function validarPassword(p: string): string | null {
  if (p.length < 8)     return 'La contraseña debe tener al menos 8 caracteres.'
  if (!/[A-Z]/.test(p)) return 'Debe incluir al menos una letra mayúscula.'
  if (!/[0-9]/.test(p)) return 'Debe incluir al menos un número.'
  return null
}
