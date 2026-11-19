// Spec: HU-028 CA-06 — fórmula de promedio ponderado exacta, función pura.

import { calcularPromedioPonderado, validarSaldoSuficiente } from '@/lib/bodega-kardex'

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

// Spec: HU-030 CA-03/RN-BOD-11 — bloqueo duro de egreso sin saldo suficiente.
describe('validarSaldoSuficiente', () => {
  it('true cuando el saldo cubre exactamente la cantidad (límite)', () => {
    expect(validarSaldoSuficiente(10, 10)).toBe(true)
  })

  it('true cuando el saldo excede la cantidad', () => {
    expect(validarSaldoSuficiente(50, 10)).toBe(true)
  })

  it('false cuando el saldo es insuficiente por poco (límite)', () => {
    expect(validarSaldoSuficiente(9.99, 10)).toBe(false)
  })

  it('false con saldo 0', () => {
    expect(validarSaldoSuficiente(0, 1)).toBe(false)
  })
})
