// Spec: HU-028 CA-06 — fórmula de promedio ponderado exacta, función pura,
// testeable sin mocks de Supabase (mismo patrón que lib/np-cobertura.ts).
export function calcularPromedioPonderado(
  saldoAnterior: number,
  costoPromedioAnterior: number,
  cantidadEntrante: number,
  costoUnitarioEntrante: number
): number {
  // Spec: caso trivial — sin saldo previo, el promedio es directamente el
  // costo de esta primera entrada.
  if (saldoAnterior <= 0) return costoUnitarioEntrante

  const valorAnterior = saldoAnterior * costoPromedioAnterior
  const valorEntrante = cantidadEntrante * costoUnitarioEntrante
  const nuevoSaldo = saldoAnterior + cantidadEntrante

  return (valorAnterior + valorEntrante) / nuevoSaldo
}
