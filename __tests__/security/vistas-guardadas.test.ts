// Spec: SC-008-v3.md — RN-02, CA-02 (desviación aprobada: 4 vistas verificadas
// contra filtros reales, no 6)

import { VISTAS_GUARDADAS, vistasVisibles, contarVista, type ConteosVistas } from '@/lib/vistas-guardadas'

describe('VISTAS_GUARDADAS — conjunto fijo', () => {
  it('tiene exactamente 4 vistas (desviación aprobada en Fase 4)', () => {
    expect(VISTAS_GUARDADAS).toHaveLength(4)
  })

  it('cada construirHref produce una URL con un valor de filtro real de su pantalla de destino', () => {
    const hrefs = VISTAS_GUARDADAS.map(v => v.construirHref({ id: 'x', rol: 'compras' }))
    expect(hrefs).toEqual([
      '/compras?estado=pendiente',
      '/compras/vista-np?sla=vencido',
      '/compras/ordenes?estado=en_aprobacion_gerencia',
      '/compras?estado=pendiente',
    ])
  })
})

describe('vistasVisibles — filtrado por rol', () => {
  it('compras ve las 3 vistas operativas (no "Mis NPs pendientes", es para solicitante/bodega/coordinador)', () => {
    const labels = vistasVisibles({ id: 'x', rol: 'compras' }).map(v => v.label)
    expect(labels).toEqual(['NPs pendientes de aprobar', 'Vencidas por SLA', 'OCs en aprobación de gerencia'])
  })

  it('gerencia ve Vencidas por SLA y OCs en aprobación de gerencia, no NPs pendientes de aprobar', () => {
    const labels = vistasVisibles({ id: 'x', rol: 'gerencia' }).map(v => v.label)
    expect(labels).toEqual(['Vencidas por SLA', 'OCs en aprobación de gerencia'])
  })

  it('solicitante solo ve Mis NPs pendientes', () => {
    const labels = vistasVisibles({ id: 'x', rol: 'solicitante' }).map(v => v.label)
    expect(labels).toEqual(['Mis NPs pendientes'])
  })

  it('consulta no ve ninguna vista guardada', () => {
    expect(vistasVisibles({ id: 'x', rol: 'consulta' })).toEqual([])
  })
})

describe('contarVista', () => {
  const conteos: ConteosVistas = { npsPendientes: 18, npsVencidasSla: 7, ocsEnAprobacionGerencia: 4 }

  it('mapea cada label al conteo correcto', () => {
    expect(contarVista('NPs pendientes de aprobar', conteos)).toBe(18)
    expect(contarVista('Mis NPs pendientes', conteos)).toBe(18)
    expect(contarVista('Vencidas por SLA', conteos)).toBe(7)
    expect(contarVista('OCs en aprobación de gerencia', conteos)).toBe(4)
  })

  it('retorna undefined para un label desconocido', () => {
    expect(contarVista('Vista inexistente', conteos)).toBeUndefined()
  })
})
