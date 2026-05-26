export function validarRucEcuador(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false
  const provincia = parseInt(ruc.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false
  const tercer = parseInt(ruc[2], 10)
  return tercer <= 6 || tercer === 9
}
