// Spec: HU-024-v1.md — CA-01, CA-02, CA-03

import {
  calcularAlertaPresupuesto,
  calcularAlertaVigencia,
  calcularAlertaReleasePendiente,
  UMBRALES_PRESUPUESTO,
  UMBRAL_VIGENCIA_DIAS,
  UMBRAL_RELEASE_PENDIENTE_HORAS,
} from '@/lib/oca-alertas'

describe('UMBRALES_PRESUPUESTO/UMBRAL_VIGENCIA_DIAS/UMBRAL_RELEASE_PENDIENTE_HORAS', () => {
  it('exporta los umbrales confirmados por el usuario', () => {
    expect(UMBRALES_PRESUPUESTO).toEqual([100, 90, 80])
    expect(UMBRAL_VIGENCIA_DIAS).toBe(15)
    expect(UMBRAL_RELEASE_PENDIENTE_HORAS).toBe(24)
  })
})

describe('calcularAlertaPresupuesto (CA-01)', () => {
  it.each([
    [79, null], [80, '80'], [89, '80'], [90, '90'], [99, '90'], [100, '100'], [105, '100'],
  ])('%s%% de ejecución -> %s', (porcentaje, esperado) => {
    expect(calcularAlertaPresupuesto(porcentaje, 'vigente')).toBe(esperado)
  })

  it('funciona también en estado agotada', () => {
    expect(calcularAlertaPresupuesto(100, 'agotada')).toBe('100')
  })

  it('devuelve null fuera de vigente/agotada aunque el porcentaje sea alto', () => {
    for (const estado of ['borrador', 'en_aprobacion', 'suspendida', 'vencida', 'cerrada']) {
      expect(calcularAlertaPresupuesto(100, estado)).toBeNull()
    }
  })
})

describe('calcularAlertaVigencia (CA-02)', () => {
  const ahora = new Date('2026-10-24T12:00:00Z')

  it('false si faltan más de 15 días', () => {
    expect(calcularAlertaVigencia('2026-11-20', 'vigente', ahora)).toBe(false)
  })

  it('true si faltan exactamente 15 días o menos', () => {
    expect(calcularAlertaVigencia('2026-11-08', 'vigente', ahora)).toBe(true)
    expect(calcularAlertaVigencia('2026-10-25', 'vigente', ahora)).toBe(true)
  })

  it('false si fecha_fin ya pasó (debería estar vencida, no vigente)', () => {
    expect(calcularAlertaVigencia('2026-10-01', 'vigente', ahora)).toBe(false)
  })

  it('false fuera de vigente', () => {
    for (const estado of ['borrador', 'agotada', 'vencida', 'suspendida', 'cerrada']) {
      expect(calcularAlertaVigencia('2026-10-25', estado, ahora)).toBe(false)
    }
  })
})

describe('calcularAlertaReleasePendiente (CA-03)', () => {
  const ahora = new Date('2026-10-24T12:00:00Z')

  it('false si tiene menos de 24h', () => {
    expect(calcularAlertaReleasePendiente('2026-10-24T10:00:00Z', 'pendiente_aprobacion', ahora)).toBe(false)
  })

  it('true si tiene más de 24h y sigue pendiente_aprobacion', () => {
    expect(calcularAlertaReleasePendiente('2026-10-23T10:00:00Z', 'pendiente_aprobacion', ahora)).toBe(true)
  })

  it('false si ya no está pendiente_aprobacion, aunque tenga más de 24h', () => {
    for (const estado of ['aprobado', 'rechazado', 'anulado']) {
      expect(calcularAlertaReleasePendiente('2026-10-01T10:00:00Z', estado, ahora)).toBe(false)
    }
  })
})
