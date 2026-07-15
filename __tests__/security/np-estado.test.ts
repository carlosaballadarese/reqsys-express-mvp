import { calcularAccionAgregada } from '@/lib/np-estado'

// Spec: HU-009-v3.md — CA-03, RN-01, RN-02, RN-04
// Nota de implementación: actualizarEstadoNP() y pausarSLAPorCierre() dependen de
// adminClient() (Supabase) y se validan mediante los tests de integración de las
// Tareas 18-23 (endpoints que las invocan), no aquí — este archivo cubre la lógica
// pura sin acceso a base de datos.

describe('calcularAccionAgregada (HU-009 RN-01 de HU-011, criterio "menos avanzado")', () => {
  it('devuelve null si no hay líneas con Acción marcada', () => {
    expect(calcularAccionAgregada([])).toBeNull()
  })

  it('devuelve el orden de la única línea si hay una sola', () => {
    expect(calcularAccionAgregada([{ orden: 4 }])).toBe(4)
  })

  it('devuelve el orden MENOR entre varias líneas con distinto avance', () => {
    // Spec: NP con línea 1 en Adjudicación (orden 6), línea 2 en Tabulación (orden 4),
    // línea 3 en Asignada (orden 1) → debe mostrar "Asignada" (orden 1), no "Adjudicación".
    expect(calcularAccionAgregada([{ orden: 6 }, { orden: 4 }, { orden: 1 }])).toBe(1)
  })

  it('es estable si todas las líneas comparten el mismo orden', () => {
    expect(calcularAccionAgregada([{ orden: 3 }, { orden: 3 }, { orden: 3 }])).toBe(3)
  })
})
