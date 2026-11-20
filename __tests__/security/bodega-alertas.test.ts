// Spec: HU-033 CA-01/CA-02 — calcularAlertaStock(), función pura.

import { calcularAlertaStock, calcularAlertaConteo } from '@/lib/bodega-alertas'

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

// Spec: HU-034 CA-01/CA-02 — semáforo de conteo físico. Fechas calculadas
// relativas a `ahora` (nunca fijas) — mismo criterio ya documentado en HU-024
// para evitar que la suite falle cuando el reloj real avance.
describe('calcularAlertaConteo', () => {
  // Spec: ultimo_conteo_fecha es una columna DATE (sin componente de hora) —
  // `ahora` se fija a medianoche UTC para que los casos límite (exactamente
  // 9 meses/1 año) comparen día contra día, sin que un desfase de horas
  // dentro del mismo día produzca un falso "ya venció" (hallazgo real del
  // propio test, no de la función: un `ahora` a mediodía quedaba por encima
  // del umbral calculado a medianoche del mismo día).
  const ahora = new Date('2026-11-19T00:00:00Z')

  it('CA-02: sin ultimo_conteo_fecha (null) → sin_conteo, nunca verde ni rojo por defecto', () => {
    expect(calcularAlertaConteo(null, ahora)).toBe('sin_conteo')
  })

  it('CA-01: conteo reciente (dentro de 9 meses) → verde', () => {
    const hace3Meses = new Date(ahora); hace3Meses.setMonth(hace3Meses.getMonth() - 3)
    expect(calcularAlertaConteo(hace3Meses.toISOString().slice(0, 10), ahora)).toBe('verde')
  })

  it('CA-01 (límite): exactamente 9 meses → todavía verde', () => {
    const hace9Meses = new Date(ahora); hace9Meses.setMonth(hace9Meses.getMonth() - 9)
    expect(calcularAlertaConteo(hace9Meses.toISOString().slice(0, 10), ahora)).toBe('verde')
  })

  it('CA-01: entre 9 meses y 1 año → amarillo', () => {
    const hace10Meses = new Date(ahora); hace10Meses.setMonth(hace10Meses.getMonth() - 10)
    expect(calcularAlertaConteo(hace10Meses.toISOString().slice(0, 10), ahora)).toBe('amarillo')
  })

  it('CA-01 (límite): exactamente 1 año → todavía amarillo', () => {
    const hace1Anio = new Date(ahora); hace1Anio.setFullYear(hace1Anio.getFullYear() - 1)
    expect(calcularAlertaConteo(hace1Anio.toISOString().slice(0, 10), ahora)).toBe('amarillo')
  })

  it('CA-01: más de 1 año → rojo', () => {
    const hace14Meses = new Date(ahora); hace14Meses.setMonth(hace14Meses.getMonth() - 14)
    expect(calcularAlertaConteo(hace14Meses.toISOString().slice(0, 10), ahora)).toBe('rojo')
  })
})
