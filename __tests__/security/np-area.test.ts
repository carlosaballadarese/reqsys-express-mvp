// Spec: SC-002-v2.md — lib/np-area.ts, sdd-design.md (Tarea 2/3 de sdd-plan.md).
// Mismo criterio que np-cobertura.test.ts / np-estado-actualizar.test.ts: probar el
// algoritmo real contra un mock de adminClient(), no solo que las rutas invocan la función.

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import {
  resolverAprobadorPorDefecto,
  listarAlternativosActivos,
  calcularAprobadorAsignado,
  verificarDependenciasActivasCoordinador,
  type AprobadorResuelto,
} from '@/lib/np-area'

// Chain mock genérico: cada método intermedio (eq/in/not/limit/select) devuelve el
// mismo objeto, que además es "thenable" — se puede await en cualquier punto de la
// cadena, igual que el query builder real de supabase-js. maybeSingle() resuelve
// directo al resultado.
function chain(result: { data?: any; error?: any; count?: number | null }) {
  const obj: any = {
    select:      () => obj,
    eq:          () => obj,
    in:          () => obj,
    not:         () => obj,
    limit:       () => obj,
    maybeSingle: () => Promise.resolve(result),
    then:        (resolve: any) => resolve(result),
  }
  return obj
}

const COORD_A: AprobadorResuelto = { id: 'coord-a', nombre: 'Coordinador A', email: 'a@arlift.com' }
const COORD_B: AprobadorResuelto = { id: 'coord-b', nombre: 'Coordinador B', email: 'b@arlift.com' }

describe('resolverAprobadorPorDefecto', () => {
  it('retorna el coordinador activo cuyo area_id coincide', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return chain({ data: [COORD_A], error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const aprobador = await resolverAprobadorPorDefecto('area-1')
    expect(aprobador).toEqual(COORD_A)
  })

  it('retorna null si el área no tiene ningún coordinador activo (CA-13: no bloquea)', async () => {
    mockFrom.mockImplementation((table: string) => chain({ data: [], error: null }))
    const aprobador = await resolverAprobadorPorDefecto('area-sin-coordinador')
    expect(aprobador).toBeNull()
  })
})

describe('listarAlternativosActivos', () => {
  it('retorna vacío si el área no tiene alternativos registrados (CA-03)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'area_aprobadores_alternativos') return chain({ data: [], error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const alternativos = await listarAlternativosActivos('area-1')
    expect(alternativos).toEqual([])
  })

  it('retorna los coordinadores activos registrados como alternativos (CA-04)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'area_aprobadores_alternativos') {
        return chain({ data: [{ coordinador_id: 'coord-b' }], error: null })
      }
      if (table === 'coordinadores_area') return chain({ data: [COORD_B], error: null })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const alternativos = await listarAlternativosActivos('area-1')
    expect(alternativos).toEqual([COORD_B])
  })
})

describe('calcularAprobadorAsignado', () => {
  // El orden real de llamadas a `from()` es determinístico (Promise.all invoca
  // resolverAprobadorPorDefecto y listarAlternativosActivos sincrónicamente en ese
  // orden; el segundo query a coordinadores_area de listarAlternativosActivos ocurre
  // recién tras su propio await, después de que ambas funciones ya iniciaron) — por
  // eso coordinadores_area se puede distinguir por orden de invocación.
  function setup(opts: {
    defaultCoordinador: AprobadorResuelto | null
    alternativoIds: string[]
    alternativosActivos: AprobadorResuelto[]
  }) {
    let coordinadoresAreaLlamadas = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') {
        coordinadoresAreaLlamadas++
        return coordinadoresAreaLlamadas === 1
          ? chain({ data: opts.defaultCoordinador ? [opts.defaultCoordinador] : [], error: null })
          : chain({ data: opts.alternativosActivos, error: null })
      }
      if (table === 'area_aprobadores_alternativos') {
        return chain({ data: opts.alternativoIds.map(id => ({ coordinador_id: id })), error: null })
      }
      throw new Error(`tabla no mockeada: ${table}`)
    })
  }

  it('sin coordinadorElegidoId usa el default del área', async () => {
    setup({ defaultCoordinador: COORD_A, alternativoIds: [], alternativosActivos: [] })
    const id = await calcularAprobadorAsignado('area-1')
    expect(id).toBe('coord-a')
  })

  it('con coordinadorElegidoId = default, lo respeta', async () => {
    setup({ defaultCoordinador: COORD_A, alternativoIds: ['coord-b'], alternativosActivos: [COORD_B] })
    const id = await calcularAprobadorAsignado('area-1', 'coord-a')
    expect(id).toBe('coord-a')
  })

  it('con coordinadorElegidoId = alternativo activo válido, lo respeta (CA-05)', async () => {
    setup({ defaultCoordinador: COORD_A, alternativoIds: ['coord-b'], alternativosActivos: [COORD_B] })
    const id = await calcularAprobadorAsignado('area-1', 'coord-b')
    expect(id).toBe('coord-b')
  })

  it('con coordinadorElegidoId inválido (ni default ni alternativo de esta área), cae al default (RN-04)', async () => {
    setup({ defaultCoordinador: COORD_A, alternativoIds: [], alternativosActivos: [] })
    const id = await calcularAprobadorAsignado('area-1', 'coord-intruso')
    expect(id).toBe('coord-a')
  })

  it('sin default y sin override válido retorna null (CA-13)', async () => {
    setup({ defaultCoordinador: null, alternativoIds: [], alternativosActivos: [] })
    const id = await calcularAprobadorAsignado('area-sin-coordinador')
    expect(id).toBeNull()
  })
})

describe('verificarDependenciasActivasCoordinador', () => {
  // maybeSingle() de coordinadores_area resuelve { data: { area_id } | null }.
  function setupCoordinador(areaId: string | null) {
    return chain({ data: areaId ? { area_id: areaId } : null, error: null })
  }

  it('sin ninguna dependencia, no bloquea', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador(null)
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 0 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 0 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(false)
    expect(resultado.motivos).toEqual([])
  })

  it('bloquea si es el aprobador por defecto de un área activa', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador('area-1')
      if (table === 'areas') return chain({ data: { activo: true }, error: null })
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 0 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 0 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(true)
    expect(resultado.motivos).toContain('Es el aprobador por defecto de un área activa')
  })

  it('NO bloquea por ser default de un área ya inactiva', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador('area-1')
      if (table === 'areas') return chain({ data: { activo: false }, error: null })
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 0 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 0 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(false)
  })

  it('bloquea si es aprobador asignado de al menos una NP viva', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador(null)
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 3 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 0 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(true)
    expect(resultado.motivos).toContain('Es el aprobador asignado de al menos una Nota de Pedido activa')
  })

  it('bloquea si está registrado como alternativo de al menos un área', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador(null)
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 0 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 1 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(true)
    expect(resultado.motivos).toContain('Está registrado como aprobador alternativo de al menos un área')
  })

  it('acumula todos los motivos aplicables a la vez', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coordinadores_area') return setupCoordinador('area-1')
      if (table === 'areas') return chain({ data: { activo: true }, error: null })
      if (table === 'notas_pedido') return chain({ data: null, error: null, count: 1 })
      if (table === 'area_aprobadores_alternativos') return chain({ data: null, error: null, count: 1 })
      throw new Error(`tabla no mockeada: ${table}`)
    })
    const resultado = await verificarDependenciasActivasCoordinador('coord-a')
    expect(resultado.bloqueado).toBe(true)
    expect(resultado.motivos).toHaveLength(3)
  })
})
