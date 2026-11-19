// Spec: HU-028 CA-06 — fórmula de promedio ponderado exacta, función pura.

import { calcularPromedioPonderado } from '@/lib/bodega-kardex'

describe('calcularPromedioPonderado', () => {
  it('CA-06 caso trivial: saldo anterior 0 usa directo el costo entrante', () => {
    expect(calcularPromedioPonderado(0, 0, 10, 25.5)).toBe(25.5)
  })

  it('CA-06 caso trivial: saldo anterior negativo (dato corrupto defensivo) también usa el costo entrante', () => {
    expect(calcularPromedioPonderado(-5, 10, 10, 25.5)).toBe(25.5)
  })

  it('CA-06 fórmula exacta con saldo y costo previos reales', () => {
    // (100*10 + 50*16) / 150 = (1000+800)/150 = 12
    expect(calcularPromedioPonderado(100, 10, 50, 16)).toBe(12)
  })

  it('CA-06 con decimales no exactos', () => {
    // (30*5.33 + 20*7.1) / 50 = (159.9 + 142)/50 = 301.9/50 = 6.038
    expect(calcularPromedioPonderado(30, 5.33, 20, 7.1)).toBeCloseTo(6.038, 5)
  })
})
