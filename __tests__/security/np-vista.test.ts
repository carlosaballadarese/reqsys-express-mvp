// Spec: HU-011-v3.md — CA-03, CA-07, CA-08, RN-01, RN-02
// Spec: HU-012-v3.md — RN-02 (calcularSlaDiasSigno)

import {
  clasificarBadgeSLA,
  accionAgregadaDeFila,
  ocVivaDeLinea,
  aplicarMaskingPrecio,
  calcularSlaDiasSigno,
} from '@/lib/np-vista'

const MS_POR_DIA = 24 * 60 * 60 * 1000

describe('calcularSlaDiasSigno (HU-012 RN-02)', () => {
  it('positivo cuando el badge es a_tiempo (margen restante)', () => {
    expect(calcularSlaDiasSigno('a_tiempo', 1 * MS_POR_DIA, 3 * MS_POR_DIA)).toBe(2)
  })

  it('negativo cuando el badge es vencido (días de atraso)', () => {
    expect(calcularSlaDiasSigno('vencido', 5 * MS_POR_DIA, 3 * MS_POR_DIA)).toBe(-2)
  })

  it('null cuando el badge es no_activo, aunque hipotéticamente hubiera valores', () => {
    expect(calcularSlaDiasSigno('no_activo', 1 * MS_POR_DIA, 3 * MS_POR_DIA)).toBeNull()
  })

  it('null cuando el badge es pausado', () => {
    expect(calcularSlaDiasSigno('pausado', 1 * MS_POR_DIA, 3 * MS_POR_DIA)).toBeNull()
  })

  it('normaliza a días una NP Excepcional (plazo de 24h = 1 día) sin caso especial', () => {
    // Excepcional: 24h de plazo = 1 día en ms; 30h transcurridas = 1.25 días
    const resultado = calcularSlaDiasSigno('vencido', 30 * 60 * 60 * 1000, 24 * 60 * 60 * 1000)
    expect(resultado).toBeCloseTo(-0.25, 5)
  })

  it('null si transcurridoMs o plazoMs son null a pesar de un badge activo (caso defensivo)', () => {
    expect(calcularSlaDiasSigno('a_tiempo', null, 3 * MS_POR_DIA)).toBeNull()
    expect(calcularSlaDiasSigno('vencido', 1 * MS_POR_DIA, null)).toBeNull()
  })
})

describe('clasificarBadgeSLA (HU-011 CA-07)', () => {
  it('"No activo" cuando sla_iniciado_en es null, sin importar el Estado', () => {
    expect(clasificarBadgeSLA({
      estado: 'aprobada', slaIniciadoEn: null, slaPausadoDesde: null,
      transcurridoMs: null, plazoMs: null,
    })).toBe('no_activo')
  })

  it('"No activo" en borrador/pendiente aunque hipotéticamente hubiera datos de SLA', () => {
    expect(clasificarBadgeSLA({
      estado: 'pendiente', slaIniciadoEn: null, slaPausadoDesde: null,
      transcurridoMs: null, plazoMs: null,
    })).toBe('no_activo')
  })

  it('"Pausado" cuando el Estado es pausable y sla_pausado_desde no es null', () => {
    expect(clasificarBadgeSLA({
      estado: 'oc_generada', slaIniciadoEn: '2026-07-13T00:00:00Z', slaPausadoDesde: '2026-07-14T00:00:00Z',
      transcurridoMs: null, plazoMs: null,
    })).toBe('pausado')
  })

  it('"Pausado" también aplica a completada (cierre administrativo, HU-006)', () => {
    expect(clasificarBadgeSLA({
      estado: 'completada', slaIniciadoEn: '2026-07-13T00:00:00Z', slaPausadoDesde: '2026-07-14T00:00:00Z',
      transcurridoMs: null, plazoMs: null,
    })).toBe('pausado')
  })

  it('"A tiempo" cuando el Estado está activo y transcurrido <= plazo', () => {
    expect(clasificarBadgeSLA({
      estado: 'en_gestion', slaIniciadoEn: '2026-07-13T00:00:00Z', slaPausadoDesde: null,
      transcurridoMs: 1000, plazoMs: 2000,
    })).toBe('a_tiempo')
  })

  it('"Vencido" cuando el Estado está activo y transcurrido > plazo', () => {
    expect(clasificarBadgeSLA({
      estado: 'oc_directa', slaIniciadoEn: '2026-07-13T00:00:00Z', slaPausadoDesde: null,
      transcurridoMs: 3000, plazoMs: 2000,
    })).toBe('vencido')
  })

  it('"No activo" como fallback defensivo si el Estado no encaja en ningún caso (ej. rechazada con sla_iniciado_en residual)', () => {
    expect(clasificarBadgeSLA({
      estado: 'rechazada', slaIniciadoEn: '2026-07-13T00:00:00Z', slaPausadoDesde: null,
      transcurridoMs: null, plazoMs: null,
    })).toBe('no_activo')
  })
})

describe('accionAgregadaDeFila (HU-011 RN-01)', () => {
  const catalogo = new Map([
    ['a1', { id: 'a1', orden: 1, descripcion: 'Asignada' }],
    ['a2', { id: 'a2', orden: 2, descripcion: 'Solicitud de ofertas' }],
    ['a3', { id: 'a3', orden: 3, descripcion: 'Ofertas recibidas' }],
  ])

  it('devuelve la Acción de menor orden entre las líneas', () => {
    const resultado = accionAgregadaDeFila('en_gestion', [
      { accion_id: 'a3' },
      { accion_id: 'a1' },
      { accion_id: 'a2' },
    ], catalogo)
    expect(resultado?.id).toBe('a1')
  })

  it('null si el Estado no es en_gestion (ej. oc_directa, RN-05 de HU-009)', () => {
    const resultado = accionAgregadaDeFila('oc_directa', [{ accion_id: 'a1' }], catalogo)
    expect(resultado).toBeNull()
  })

  it('null si ninguna línea tiene Acción marcada', () => {
    const resultado = accionAgregadaDeFila('en_gestion', [{ accion_id: null }, { accion_id: null }], catalogo)
    expect(resultado).toBeNull()
  })

  it('ignora accion_id que ya no existe en el catálogo (Acción eliminada)', () => {
    const resultado = accionAgregadaDeFila('en_gestion', [
      { accion_id: 'a-eliminada' },
      { accion_id: 'a2' },
    ], catalogo)
    expect(resultado?.id).toBe('a2')
  })
})

describe('ocVivaDeLinea (HU-011 CA-03, RN-02)', () => {
  it('devuelve {id, numero_oc} si hay una OC viva para la línea', () => {
    const mapa = new Map([
      ['item-1', [{ id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'aprobada' }]],
    ])
    expect(ocVivaDeLinea('item-1', mapa)).toEqual({ id: 'oc-1', numero_oc: 'OC-2026-0001' })
  })

  it('devuelve null si la única OC de la línea está rechazada', () => {
    const mapa = new Map([
      ['item-1', [{ id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'rechazada' }]],
    ])
    expect(ocVivaDeLinea('item-1', mapa)).toBeNull()
  })

  it('devuelve null si la única OC de la línea está cancelada', () => {
    const mapa = new Map([
      ['item-1', [{ id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'cancelada' }]],
    ])
    expect(ocVivaDeLinea('item-1', mapa)).toBeNull()
  })

  it('devuelve null si la línea no tiene ninguna OC generada', () => {
    expect(ocVivaDeLinea('item-sin-oc', new Map())).toBeNull()
  })

  it('encuentra la OC viva entre varias (una cancelada + una viva)', () => {
    const mapa = new Map([
      ['item-1', [
        { id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'cancelada' },
        { id: 'oc-2', numero_oc: 'OC-2026-0002', estado_oc: 'en_proceso' },
      ]],
    ])
    expect(ocVivaDeLinea('item-1', mapa)).toEqual({ id: 'oc-2', numero_oc: 'OC-2026-0002' })
  })
})

describe('aplicarMaskingPrecio (HU-011 CA-08)', () => {
  it('conserva precio_unitario si verPrecio es true', () => {
    const item = aplicarMaskingPrecio({ precio_unitario: 15.5 }, true)
    expect(item.precio_unitario).toBe(15.5)
  })

  it('enmascara precio_unitario a null si verPrecio es false', () => {
    const item = aplicarMaskingPrecio({ precio_unitario: 15.5 }, false)
    expect(item.precio_unitario).toBeNull()
  })

  it('preserva el resto de campos del objeto sin alterarlos', () => {
    const item = aplicarMaskingPrecio({ precio_unitario: 15.5, descripcion: 'Tubería' }, false)
    expect(item.descripcion).toBe('Tubería')
  })
})
