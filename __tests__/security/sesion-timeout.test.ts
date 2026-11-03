// Spec: cierre de sesión por timebox/inactividad (Supabase Free no soporta
// [auth.sessions] nativo) — lib/sesion-timeout.ts

import {
  excedeTimebox,
  excedeInactividad,
  SESSION_TIMEBOX_HORAS,
  SESSION_INACTIVIDAD_HORAS,
  ULTIMA_ACTIVIDAD_COOKIE,
} from '@/lib/sesion-timeout'

describe('constantes', () => {
  it('timebox 24h, inactividad 8h — valores confirmados por el usuario', () => {
    expect(SESSION_TIMEBOX_HORAS).toBe(24)
    expect(SESSION_INACTIVIDAD_HORAS).toBe(8)
    expect(ULTIMA_ACTIVIDAD_COOKIE).toBe('reqsys_ultima_actividad')
  })
})

describe('excedeTimebox', () => {
  const ahora = new Date('2026-11-02T12:00:00.000Z')

  it('false justo antes de las 24h', () => {
    const lastSignInAt = new Date(ahora.getTime() - (24 * 60 * 60 * 1000 - 1000)).toISOString()
    expect(excedeTimebox(lastSignInAt, ahora)).toBe(false)
  })

  it('false exactamente a las 24h (límite no excedido, no igualado)', () => {
    const lastSignInAt = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(excedeTimebox(lastSignInAt, ahora)).toBe(false)
  })

  it('true justo después de las 24h', () => {
    const lastSignInAt = new Date(ahora.getTime() - (24 * 60 * 60 * 1000 + 1000)).toISOString()
    expect(excedeTimebox(lastSignInAt, ahora)).toBe(true)
  })

  it('false para un login reciente', () => {
    const lastSignInAt = new Date(ahora.getTime() - 60 * 1000).toISOString()
    expect(excedeTimebox(lastSignInAt, ahora)).toBe(false)
  })
})

describe('excedeInactividad', () => {
  const ahora = new Date('2026-11-02T12:00:00.000Z')

  it('false cuando no hay cookie todavía (null, primera request tras login)', () => {
    expect(excedeInactividad(null, ahora)).toBe(false)
  })

  it('false justo antes de las 8h de inactividad', () => {
    const ultimaActividadMs = ahora.getTime() - (8 * 60 * 60 * 1000 - 1000)
    expect(excedeInactividad(ultimaActividadMs, ahora)).toBe(false)
  })

  it('false exactamente a las 8h', () => {
    const ultimaActividadMs = ahora.getTime() - 8 * 60 * 60 * 1000
    expect(excedeInactividad(ultimaActividadMs, ahora)).toBe(false)
  })

  it('true justo después de las 8h de inactividad', () => {
    const ultimaActividadMs = ahora.getTime() - (8 * 60 * 60 * 1000 + 1000)
    expect(excedeInactividad(ultimaActividadMs, ahora)).toBe(true)
  })

  it('false con actividad reciente', () => {
    const ultimaActividadMs = ahora.getTime() - 60 * 1000
    expect(excedeInactividad(ultimaActividadMs, ahora)).toBe(false)
  })
})
