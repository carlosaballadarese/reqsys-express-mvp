// Spec: HU-040-v1.md — CA-02 a CA-08

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => ({ from: mockFrom }),
}))

import {
  obtenerCategoriasReporte,
  obtenerPuntosEntregaReporte,
} from '@/lib/bodega-catalogos-reportes'

function chain(data: unknown[]) {
  return { select: () => ({ order: () => Promise.resolve({ data, error: null }) }) }
}

describe('obtenerCategoriasReporte (CA-03, CA-08)', () => {
  it('resuelve las Áreas Técnicas cruzadas (N:M) por nombre, incluye categorías inactivas', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'categorias') return chain([
        { id: 'cat-1', nombre: 'Cables', activo: true },
        { id: 'cat-2', nombre: 'Tornillos', activo: false },
      ])
      if (table === 'area_categoria_bodega') {
        return { select: () => Promise.resolve({ data: [
          { categoria_id: 'cat-1', area_id: 'area-1' },
          { categoria_id: 'cat-1', area_id: 'area-2' },
        ], error: null }) }
      }
      if (table === 'areas') {
        return { select: () => Promise.resolve({ data: [
          { id: 'area-1', nombre: 'Mecánico' },
          { id: 'area-2', nombre: 'Eléctrico' },
        ], error: null }) }
      }
      return chain([])
    })

    const filas = await obtenerCategoriasReporte()
    expect(filas).toEqual([
      { nombre: 'Cables', activo: true, areas: ['Eléctrico', 'Mecánico'] },
      { nombre: 'Tornillos', activo: false, areas: [] },
    ])
  })
})

describe('obtenerPuntosEntregaReporte (CA-05)', () => {
  it('resuelve el nombre del Cliente Final asociado, null si no tiene', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'puntos_entrega') return chain([
        { nombre: 'Bodega Norte', cliente_final_id: 'cf-1', activo: true },
        { nombre: 'Sin cliente', cliente_final_id: null, activo: true },
      ])
      if (table === 'clientes_finales') return { select: () => Promise.resolve({ data: [{ id: 'cf-1', nombre: 'ACME' }], error: null }) }
      return chain([])
    })

    const filas = await obtenerPuntosEntregaReporte()
    expect(filas).toEqual([
      { nombre: 'Bodega Norte', clienteFinalNombre: 'ACME', activo: true },
      { nombre: 'Sin cliente', clienteFinalNombre: null, activo: true },
    ])
  })
})
