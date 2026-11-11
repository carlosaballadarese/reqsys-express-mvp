// Spec: SC-009-v2.md — CA-01 a CA-03, CA-09 (resaltado), RN-02 (sin query nueva)

import { VISTAS_MIS_NPS, vistasMisNPsVisibles } from '@/lib/vistas-mis-nps'

describe('VISTAS_MIS_NPS — conjunto fijo', () => {
  it('tiene exactamente 3 vistas (Todas / Pendientes de aprobar / Completadas)', () => {
    expect(VISTAS_MIS_NPS.map(v => v.label)).toEqual(['Todas', 'Pendientes de aprobar', 'Completadas'])
  })

  it('cada construirHref produce una URL con un valor de filtro real de GET /api/compras/nps', () => {
    const hrefs = VISTAS_MIS_NPS.map(v => v.construirHref({ id: 'x', rol: 'compras' }))
    expect(hrefs).toEqual(['/compras', '/compras?estado=pendiente', '/compras?estado=completada'])
  })
})

describe('vistasMisNPsVisibles — filtrado por rol', () => {
  it('compras ve las 3 vistas', () => {
    expect(vistasMisNPsVisibles({ id: 'x', rol: 'compras' }).map(v => v.label))
      .toEqual(['Todas', 'Pendientes de aprobar', 'Completadas'])
  })

  it('admin ve las 3 vistas', () => {
    expect(vistasMisNPsVisibles({ id: 'x', rol: 'admin' }).map(v => v.label))
      .toEqual(['Todas', 'Pendientes de aprobar', 'Completadas'])
  })

  it('coordinador ve Pendientes de aprobar (aprueba NPs de su área)', () => {
    expect(vistasMisNPsVisibles({ id: 'x', rol: 'coordinador' }).map(v => v.label))
      .toEqual(['Todas', 'Pendientes de aprobar', 'Completadas'])
  })

  it('solicitante NO ve Pendientes de aprobar (no le corresponde aprobar)', () => {
    expect(vistasMisNPsVisibles({ id: 'x', rol: 'solicitante' }).map(v => v.label))
      .toEqual(['Todas', 'Completadas'])
  })

  it('asistente_compras NO ve Pendientes de aprobar', () => {
    expect(vistasMisNPsVisibles({ id: 'x', rol: 'asistente_compras' }).map(v => v.label))
      .toEqual(['Todas', 'Completadas'])
  })
})

describe('esActiva — resaltado de vista activa (CA-09)', () => {
  const [todas, pendientes, completadas] = VISTAS_MIS_NPS

  it('"Todas" está activa sin query string, o con estado=todos', () => {
    expect(todas.esActiva(new URLSearchParams())).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=todos'))).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=pendiente'))).toBe(false)
  })

  it('"Pendientes de aprobar" está activa solo con estado=pendiente, sin importar otros params', () => {
    expect(pendientes.esActiva(new URLSearchParams('estado=pendiente'))).toBe(true)
    expect(pendientes.esActiva(new URLSearchParams('estado=pendiente&area=TI'))).toBe(true)
    expect(pendientes.esActiva(new URLSearchParams('estado=completada'))).toBe(false)
  })

  it('"Completadas" está activa solo con estado=completada', () => {
    expect(completadas.esActiva(new URLSearchParams('estado=completada'))).toBe(true)
    expect(completadas.esActiva(new URLSearchParams())).toBe(false)
  })
})

describe('contar — sobre un arreglo base ya cargado (RN-02, sin endpoint nuevo)', () => {
  const [todas, pendientes, completadas] = VISTAS_MIS_NPS
  const nps = [
    { estado: 'pendiente' },
    { estado: 'pendiente' },
    { estado: 'completada' },
    { estado: 'aprobada' },
  ]

  it('"Todas" cuenta el arreglo completo', () => {
    expect(todas.contar(nps)).toBe(4)
  })

  it('"Pendientes de aprobar" cuenta solo estado=pendiente', () => {
    expect(pendientes.contar(nps)).toBe(2)
  })

  it('"Completadas" cuenta solo estado=completada', () => {
    expect(completadas.contar(nps)).toBe(1)
  })
})
