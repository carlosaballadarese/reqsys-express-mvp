// Spec: SC-008-v2.md — CA-04, CA-05

import { pendientesParaCoordinador, pendientesParaGerencia } from '@/lib/home-pendientes'

describe('pendientesParaCoordinador (CA-04)', () => {
  it('incluye solo NPs en estado pendiente', () => {
    const nps = [
      { id: '1', numero: 'NP-2026-0001', estado: 'pendiente', total_estimado: 100 },
      { id: '2', numero: 'NP-2026-0002', estado: 'aprobada', total_estimado: 200 },
      { id: '3', numero: 'NP-2026-0003', estado: 'pendiente', total_estimado: 300 },
    ]
    const resultado = pendientesParaCoordinador(nps)
    expect(resultado).toHaveLength(2)
    expect(resultado.map(r => r.numero)).toEqual(['NP-2026-0001', 'NP-2026-0003'])
    expect(resultado[0]).toEqual({ tipo: 'np', numero: 'NP-2026-0001', href: '/compras/1', monto: 100 })
  })

  it('devuelve [] si no hay ninguna NP pendiente', () => {
    expect(pendientesParaCoordinador([{ id: '1', numero: 'NP-2026-0001', estado: 'aprobada' }])).toEqual([])
  })
})

describe('pendientesParaGerencia (CA-05)', () => {
  it('incluye OCs en_aprobacion_gerencia y OCAs en_aprobacion', () => {
    const ocs = [
      { id: 'a', numero_oc: 'OC-2026-0001', estado_oc: 'en_aprobacion_gerencia', valor_total: 2500 },
      { id: 'b', numero_oc: 'OC-2026-0002', estado_oc: 'en_aprobacion_compras', valor_total: 500 },
      { id: 'c', numero_oc: 'OC-2026-0003', estado_oc: 'aprobada', valor_total: 9000 },
    ]
    const ocas = [
      { id: 'x', numero_oca: 'OCA-2026-0001', estado: 'en_aprobacion' },
      { id: 'y', numero_oca: 'OCA-2026-0002', estado: 'vigente' },
    ]
    const resultado = pendientesParaGerencia(ocs, ocas)
    expect(resultado.map(r => `${r.tipo}:${r.numero}`)).toEqual([
      'oc:OC-2026-0001', 'oca:OCA-2026-0001',
    ])
  })

  it('devuelve [] si no hay ningún pendiente en ninguna de las 2 fuentes', () => {
    expect(pendientesParaGerencia([], [])).toEqual([])
  })
})
