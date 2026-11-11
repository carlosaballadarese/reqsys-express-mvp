// Spec: SC-011-v2.md — CA-01 a CA-05, CA-07 (resaltado con deep-link de SC-008),
// RN-01 (mismos 7 roles), RN-02 (sin query nueva), RN-06 (orden tras merge
// probado en el propio page.tsx, no aquí — este archivo cubre solo contar/
// esActiva/vistasOrdenesVisibles, funciones puras sin fetch)

import { VISTAS_ORDENES, vistasOrdenesVisibles, EN_APROBACION } from '@/lib/vistas-ordenes'

describe('VISTAS_ORDENES — conjunto fijo', () => {
  it('tiene exactamente 4 vistas (Todas / En aprobación / Aprobadas / Canceladas)', () => {
    expect(VISTAS_ORDENES.map(v => v.label)).toEqual(['Todas', 'En aprobación', 'Aprobadas', 'Canceladas'])
  })

  it('cada construirHref produce una URL con un valor de filtro real/centinela de /compras/ordenes', () => {
    expect(VISTAS_ORDENES.map(v => v.construirHref())).toEqual([
      '/compras/ordenes',
      '/compras/ordenes?estado=en_aprobacion',
      '/compras/ordenes?estado=aprobada',
      '/compras/ordenes?estado=cancelada',
    ])
  })

  it('EN_APROBACION son exactamente los 2 valores reales que GET /api/compras/ordenes ya soporta', () => {
    expect(EN_APROBACION).toEqual(['en_aprobacion_compras', 'en_aprobacion_gerencia'])
  })
})

describe('vistasOrdenesVisibles — RN-01 (mismos 7 roles, sin diferenciar más)', () => {
  it('compras ve las 4 vistas', () => {
    expect(vistasOrdenesVisibles({ rol: 'compras' }).map(v => v.label))
      .toEqual(['Todas', 'En aprobación', 'Aprobadas', 'Canceladas'])
  })

  it('admin ve las 4 vistas', () => {
    expect(vistasOrdenesVisibles({ rol: 'admin' }).map(v => v.label))
      .toEqual(['Todas', 'En aprobación', 'Aprobadas', 'Canceladas'])
  })

  it('solicitante ve las 4 vistas (el backend no distingue scope por rol, RN-04)', () => {
    expect(vistasOrdenesVisibles({ rol: 'solicitante' }).map(v => v.label))
      .toEqual(['Todas', 'En aprobación', 'Aprobadas', 'Canceladas'])
  })

  it('coordinador, gerencia, consulta y asistente_compras ven las 4 vistas', () => {
    for (const rol of ['coordinador', 'gerencia', 'consulta', 'asistente_compras'] as const) {
      expect(vistasOrdenesVisibles({ rol }).map(v => v.label))
        .toEqual(['Todas', 'En aprobación', 'Aprobadas', 'Canceladas'])
    }
  })
})

describe('esActiva — resaltado de vista activa', () => {
  const [todas, enAprobacion, aprobadas, canceladas] = VISTAS_ORDENES

  it('"Todas" está activa sin query string, o con estado=todos', () => {
    expect(todas.esActiva(new URLSearchParams())).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=todos'))).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=aprobada'))).toBe(false)
  })

  it('"En aprobación" está activa con el centinela "en_aprobacion" (clic desde Vistas)', () => {
    expect(enAprobacion.esActiva(new URLSearchParams('estado=en_aprobacion'))).toBe(true)
  })

  it('"En aprobación" está activa con cada valor real individual (CA-07, deep-link ya existente de SC-008)', () => {
    expect(enAprobacion.esActiva(new URLSearchParams('estado=en_aprobacion_compras'))).toBe(true)
    expect(enAprobacion.esActiva(new URLSearchParams('estado=en_aprobacion_gerencia'))).toBe(true)
  })

  it('"En aprobación" NO está activa con otros estados, ni combinada con area/q', () => {
    expect(enAprobacion.esActiva(new URLSearchParams('estado=aprobada'))).toBe(false)
    expect(enAprobacion.esActiva(new URLSearchParams('estado=en_aprobacion_gerencia&area=TI'))).toBe(true)
  })

  it('"Aprobadas" y "Canceladas" están activas solo con su propio valor exacto', () => {
    expect(aprobadas.esActiva(new URLSearchParams('estado=aprobada'))).toBe(true)
    expect(aprobadas.esActiva(new URLSearchParams('estado=cancelada'))).toBe(false)
    expect(canceladas.esActiva(new URLSearchParams('estado=cancelada'))).toBe(true)
    expect(canceladas.esActiva(new URLSearchParams())).toBe(false)
  })
})

describe('contar — sobre el arreglo "baseline" ya cargado (RN-02, sin endpoint nuevo)', () => {
  const [todas, enAprobacion, aprobadas, canceladas] = VISTAS_ORDENES
  const ocs = [
    { estado_oc: 'en_aprobacion_compras' },
    { estado_oc: 'en_aprobacion_gerencia' },
    { estado_oc: 'en_aprobacion_gerencia' },
    { estado_oc: 'aprobada' },
    { estado_oc: 'cancelada' },
    { estado_oc: 'en_proceso' },
  ]

  it('"Todas" cuenta el arreglo completo', () => {
    expect(todas.contar(ocs)).toBe(6)
  })

  it('"En aprobación" suma ambos estados sin duplicar ni omitir (CA-03)', () => {
    expect(enAprobacion.contar(ocs)).toBe(3)
  })

  it('"Aprobadas" y "Canceladas" cuentan solo su propio estado', () => {
    expect(aprobadas.contar(ocs)).toBe(1)
    expect(canceladas.contar(ocs)).toBe(1)
  })
})
