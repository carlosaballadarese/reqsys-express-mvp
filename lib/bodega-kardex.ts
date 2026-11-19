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

// Spec: HU-030 CA-03/RN-BOD-11 — bloqueo duro de egreso sin saldo suficiente,
// salvo override explícito de admin (resuelto en el llamador, no aquí).
export function validarSaldoSuficiente(saldoActual: number, cantidad: number): boolean {
  return saldoActual >= cantidad
}
