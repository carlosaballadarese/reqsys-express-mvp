// Spec: SC-008-v4.md CA-02 — "Actividad reciente" en Inicio

import { describirAuditoria, tiempoRelativo, type AuditoriaRow } from '@/lib/auditoria-texto'

function fila(overrides: Partial<AuditoriaRow> = {}): AuditoriaRow {
  return {
    id: '1', created_at: '2026-11-08T12:00:00Z', usuario_nombre: 'Claudia Sánchez',
    accion: 'aprobar_oc', entidad: 'registro_compras', referencia: 'OC-2026-0498',
    ...overrides,
  }
}

describe('describirAuditoria', () => {
  it('arma una frase legible para una acción mapeada, con el actor al final', () => {
    expect(describirAuditoria(fila())).toBe('OC-2026-0498 aprobada · Claudia Sánchez')
  })

  it('cubre acciones de OCA, releases y enmiendas', () => {
    expect(describirAuditoria(fila({ accion: 'generar_release_oca', referencia: 'OCA-2026-0004-R003', usuario_nombre: 'Carlos B.' })))
      .toBe('Release OCA-2026-0004-R003 generado · Carlos B.')
    expect(describirAuditoria(fila({ accion: 'aprobar_enmienda_oca', referencia: 'OCA-2026-0003', usuario_nombre: null })))
      .toBe('Enmienda aprobada para OCA-2026-0003')
  })

  it('usa un fallback legible para una acción sin plantilla mapeada', () => {
    expect(describirAuditoria(fila({ accion: 'accion_nunca_vista', referencia: 'X-001', usuario_nombre: null })))
      .toBe('X-001 — accion nunca vista')
  })

  it('cae a una etiqueta legible de la entidad y luego a "registro" cuando no hay referencia', () => {
    expect(describirAuditoria(fila({ accion: 'accion_rara', referencia: null, entidad: 'proveedor', usuario_nombre: null })))
      .toBe('Proveedor — accion rara')
    expect(describirAuditoria(fila({ accion: 'accion_rara', referencia: null, entidad: null, usuario_nombre: null })))
      .toBe('registro — accion rara')
  })

  it('degrada con gracia cuando el registro real solo trae entidad_id (sin referencia) — caso real: enviar_aprobacion_oca', () => {
    expect(describirAuditoria(fila({ accion: 'enviar_aprobacion_oca', referencia: null, entidad: 'oca', usuario_nombre: 'Compras de Prueba' })))
      .toBe('OCA enviada a aprobación · Compras de Prueba')
  })

  it('omite el separador de actor cuando usuario_nombre es null', () => {
    expect(describirAuditoria(fila({ usuario_nombre: null }))).toBe('OC-2026-0498 aprobada')
  })
})

describe('tiempoRelativo', () => {
  const ahora = new Date('2026-11-08T12:00:00Z')

  it.each([
    ['2026-11-08T11:59:30Z', 'hace instantes'],
    ['2026-11-08T11:48:00Z', 'hace 12 min'],
    ['2026-11-08T11:20:00Z', 'hace 40 min'],
    ['2026-11-08T11:00:00Z', 'hace 1 h'],
    ['2026-11-08T09:00:00Z', 'hace 3 h'],
    ['2026-11-07T12:00:00Z', 'hace 1 d'],
    ['2026-11-05T12:00:00Z', 'hace 3 d'],
  ])('%s -> %s', (fecha, esperado) => {
    expect(tiempoRelativo(fecha, ahora)).toBe(esperado)
  })
})
