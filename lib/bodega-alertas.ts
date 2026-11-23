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

// Spec: HU-034 CA-01/CA-02 — semáforo de conteo físico, con los mismos
// umbrales reales que ya usa la empresa en su Excel (verde ≤9 meses,
// amarillo entre 9 meses y 1 año, rojo >1 año). `ahora` es inyectable para
// tests deterministas (mismo patrón lib/oca-alertas.ts, HU-024).
export type SemaforoConteo = 'verde' | 'amarillo' | 'rojo' | 'sin_conteo'

export function calcularAlertaConteo(
  ultimoConteoFecha: string | null,
  ahora: Date = new Date()
): SemaforoConteo {
  if (!ultimoConteoFecha) return 'sin_conteo'

  const fecha = new Date(ultimoConteoFecha)
  const umbral9Meses = new Date(fecha)
  umbral9Meses.setMonth(umbral9Meses.getMonth() + 9)
  const umbral1Anio = new Date(fecha)
  umbral1Anio.setFullYear(umbral1Anio.getFullYear() + 1)

  if (ahora <= umbral9Meses) return 'verde'
  if (ahora <= umbral1Anio) return 'amarillo'
  return 'rojo'
}
