// Spec: HU-033 CA-01/CA-02 — calcularAlertaStock(), función pura.

import { calcularAlertaStock } from '@/lib/bodega-alertas'

describe('calcularAlertaStock', () => {
  it('sin mínimo ni máximo configurados (ambos null): sin ninguna alerta', () => {
    expect(calcularAlertaStock(0, null, null)).toEqual({ bajoMinimo: false, sobreMaximo: false })
    expect(calcularAlertaStock(1000, null, null)).toEqual({ bajoMinimo: false, sobreMaximo: false })
  })

  it('CA-02 (límite): saldo exactamente igual al mínimo NO es "bajo mínimo"', () => {
    expect(calcularAlertaStock(10, 10, null).bajoMinimo).toBe(false)
  })

  it('saldo por debajo del mínimo: bajoMinimo=true', () => {
    expect(calcularAlertaStock(9, 10, null).bajoMinimo).toBe(true)
  })

  it('CA-02 (límite): saldo exactamente igual al máximo NO es "sobre máximo"', () => {
    expect(calcularAlertaStock(100, null, 100).sobreMaximo).toBe(false)
  })

  it('saldo por encima del máximo: sobreMaximo=true', () => {
    expect(calcularAlertaStock(101, null, 100).sobreMaximo).toBe(true)
  })

  it('CA-02: solo mínimo configurado, sin máximo — evalúa solo esa condición', () => {
    expect(calcularAlertaStock(5, 10, null)).toEqual({ bajoMinimo: true, sobreMaximo: false })
  })

  it('CA-02: solo máximo configurado, sin mínimo — evalúa solo esa condición', () => {
    expect(calcularAlertaStock(200, null, 100)).toEqual({ bajoMinimo: false, sobreMaximo: true })
  })

  it('ambos configurados, saldo dentro del rango: sin alerta', () => {
    expect(calcularAlertaStock(50, 10, 100)).toEqual({ bajoMinimo: false, sobreMaximo: false })
  })
})
