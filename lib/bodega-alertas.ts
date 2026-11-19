// Spec: HU-033 CA-01/CA-02 — indicador de stock bajo mínimo/sobre máximo,
// cada condición evaluada de forma independiente (null nunca se interpreta
// como "siempre en alerta" ni "nunca en alerta"). Función pura, testeable
// sin mocks de Supabase — mismo patrón ya validado con lib/oca-alertas.ts.
export function calcularAlertaStock(
  saldo: number,
  minimo: number | null,
  maximo: number | null
): { bajoMinimo: boolean; sobreMaximo: boolean } {
  return {
    bajoMinimo: minimo != null && saldo < minimo,
    sobreMaximo: maximo != null && saldo > maximo,
  }
}
