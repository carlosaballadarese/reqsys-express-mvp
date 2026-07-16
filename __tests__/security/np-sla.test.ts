// Spec: HU-009-v3.md — CA-09, CA-10, RN-02

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))

import { esDiaHabil, diasHabilesEntre, calcularSLA, obtenerFeriadosEnRango, diasHabilesEntreSync, calcularTranscurridoLote } from '@/lib/np-sla'

function chainFeriados(fechasFeriado: Set<string>) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn((_col: string, val: string) => ({
        maybeSingle: jest.fn(() =>
          Promise.resolve({ data: fechasFeriado.has(val) ? { id: 'f1' } : null })
        ),
      })),
    })),
  }
}

function chainNotaPedido(np: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: np })),
      })),
    })),
  }
}

function setupFrom(feriados: Set<string>, np?: unknown) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'feriados') return chainFeriados(feriados)
    if (table === 'notas_pedido') return chainNotaPedido(np)
    throw new Error(`tabla no mockeada: ${table}`)
  })
}

describe('esDiaHabil (HU-009 CA-09)', () => {
  it('rechaza sábado', async () => {
    setupFrom(new Set())
    expect(await esDiaHabil(new Date('2026-07-18T00:00:00.000Z'))).toBe(false) // sábado
  })

  it('rechaza domingo', async () => {
    setupFrom(new Set())
    expect(await esDiaHabil(new Date('2026-07-19T00:00:00.000Z'))).toBe(false) // domingo
  })

  it('acepta lunes sin feriado', async () => {
    setupFrom(new Set())
    expect(await esDiaHabil(new Date('2026-07-13T00:00:00.000Z'))).toBe(true) // lunes
  })

  it('rechaza un día laboral que coincide con un feriado registrado', async () => {
    setupFrom(new Set(['2026-08-10'])) // lunes, Primer Grito de la Independencia
    expect(await esDiaHabil(new Date('2026-08-10T00:00:00.000Z'))).toBe(false)
  })
})

describe('diasHabilesEntre (HU-009 CA-09)', () => {
  it('cuenta lunes a jueves como 4 días hábiles (viernes excluido por ser el límite exclusivo)', async () => {
    setupFrom(new Set())
    const dias = await diasHabilesEntre(
      new Date('2026-07-13T00:00:00.000Z'), // lunes
      new Date('2026-07-17T00:00:00.000Z')  // viernes (límite exclusivo)
    )
    expect(dias).toBe(4)
  })

  it('descuenta el feriado dentro del rango', async () => {
    setupFrom(new Set(['2026-08-10']))
    const dias = await diasHabilesEntre(
      new Date('2026-08-10T00:00:00.000Z'), // lunes feriado
      new Date('2026-08-13T00:00:00.000Z')  // jueves
    )
    expect(dias).toBe(2) // martes y miércoles; lunes es feriado
  })

  it('devuelve 0 si hasta no es posterior a desde', async () => {
    setupFrom(new Set())
    const fecha = new Date('2026-07-13T00:00:00.000Z')
    expect(await diasHabilesEntre(fecha, fecha)).toBe(0)
  })
})

describe('calcularSLA (HU-009 CA-09, RN-02)', () => {
  it('devuelve null si la NP nunca inició SLA', async () => {
    setupFrom(new Set(), { estado: 'aprobada', prioridad: 'alta', sla_iniciado_en: null })
    expect(await calcularSLA('np-1')).toBeNull()
  })

  it('Prioridad Excepcional se mide en horas corridas y detecta vencido', async () => {
    setupFrom(new Set(), {
      estado: 'oc_directa',
      prioridad: 'excepcional',
      sla_iniciado_en: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // hace 30h
      sla_pausado_desde: null,
      sla_pausado_acumulado_seg: 0,
    })
    const sla = await calcularSLA('np-2')
    expect(sla?.unidad).toBe('horas')
    expect(sla?.vencido).toBe(true) // 30h transcurridas > 24h de plazo
    expect(sla?.activo).toBe(true)
  })

  it('Prioridad Alta se mide en días hábiles (3 días de plazo)', async () => {
    setupFrom(new Set(), {
      estado: 'en_gestion',
      prioridad: 'alta',
      sla_iniciado_en: '2026-07-13T00:00:00.000Z', // lunes
      sla_pausado_desde: '2026-07-17T00:00:00.000Z', // viernes: 4 días hábiles transcurridos
      sla_pausado_acumulado_seg: 0,
    })
    const sla = await calcularSLA('np-3')
    expect(sla?.unidad).toBe('dias_habiles')
    expect(sla?.vencido).toBe(true) // 4 días hábiles > 3 de plazo
  })

  it('congela el cálculo en sla_pausado_desde cuando el SLA está pausado', async () => {
    setupFrom(new Set(), {
      estado: 'oc_generada',
      prioridad: 'baja',
      sla_iniciado_en: '2026-07-13T00:00:00.000Z',
      sla_pausado_desde: '2026-07-14T00:00:00.000Z', // se pausó 1 día hábil después
      sla_pausado_acumulado_seg: 0,
    })
    const sla = await calcularSLA('np-4')
    expect(sla?.activo).toBe(false) // Estado fuera de {en_gestion, oc_directa}
    expect(sla?.vencido).toBe(false) // 1 día hábil << 30 días de plazo (Baja)
  })
})

function chainFeriadosRango(fechas: string[]) {
  return {
    select: jest.fn(() => ({
      gte: jest.fn(() => ({
        lte: jest.fn(() => Promise.resolve({ data: fechas.map(fecha => ({ fecha })) })),
      })),
    })),
  }
}

describe('obtenerFeriadosEnRango (HU-011)', () => {
  it('devuelve un Set con las fechas de feriados del rango', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'feriados') return chainFeriadosRango(['2026-08-10', '2026-10-09'])
      throw new Error(`tabla no mockeada: ${table}`)
    })

    const feriados = await obtenerFeriadosEnRango(new Date('2026-07-01'), new Date('2026-10-31'))
    expect(feriados).toEqual(new Set(['2026-08-10', '2026-10-09']))
  })

  it('devuelve un Set vacío si no hay feriados en el rango', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'feriados') return chainFeriadosRango([])
      throw new Error(`tabla no mockeada: ${table}`)
    })

    const feriados = await obtenerFeriadosEnRango(new Date('2026-07-01'), new Date('2026-07-10'))
    expect(feriados.size).toBe(0)
  })
})

describe('diasHabilesEntreSync (HU-011) — equivalencia con diasHabilesEntre', () => {
  it('cuenta lunes a jueves como 4 días hábiles, igual que la versión async', () => {
    const dias = diasHabilesEntreSync(
      new Date('2026-07-13T00:00:00.000Z'), // lunes
      new Date('2026-07-17T00:00:00.000Z'), // viernes (límite exclusivo)
      new Set()
    )
    expect(dias).toBe(4)
  })

  it('descuenta el feriado dentro del rango, igual que la versión async', () => {
    const dias = diasHabilesEntreSync(
      new Date('2026-08-10T00:00:00.000Z'), // lunes feriado
      new Date('2026-08-13T00:00:00.000Z'), // jueves
      new Set(['2026-08-10'])
    )
    expect(dias).toBe(2) // martes y miércoles; lunes es feriado
  })

  it('excluye fines de semana igual que la versión async', () => {
    const dias = diasHabilesEntreSync(
      new Date('2026-07-17T00:00:00.000Z'), // viernes
      new Date('2026-07-20T00:00:00.000Z'), // lunes (límite exclusivo, cruza el fin de semana)
      new Set()
    )
    expect(dias).toBe(1) // solo el viernes
  })

  it('devuelve 0 si hasta no es posterior a desde', () => {
    const fecha = new Date('2026-07-13T00:00:00.000Z')
    expect(diasHabilesEntreSync(fecha, fecha, new Set())).toBe(0)
  })
})

describe('calcularTranscurridoLote (HU-011) — equivalencia con la aritmética de calcularSLA', () => {
  it('Prioridad Excepcional se mide en horas corridas y detecta vencido, igual que calcularSLA', () => {
    const resultado = calcularTranscurridoLote({
      prioridad: 'excepcional',
      slaIniciadoEn: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // hace 30h
      slaPausadoDesde: null,
      slaPausadoAcumuladoSeg: 0,
      feriados: new Set(),
    })
    expect(resultado.unidad).toBe('horas')
    expect(resultado.transcurridoMs).toBeGreaterThan(resultado.plazoMs) // 30h > 24h de plazo
  })

  it('Prioridad Alta se mide en días hábiles, igual que calcularSLA', () => {
    const resultado = calcularTranscurridoLote({
      prioridad: 'alta',
      slaIniciadoEn: '2026-07-13T00:00:00.000Z', // lunes
      slaPausadoDesde: '2026-07-17T00:00:00.000Z', // viernes: 4 días hábiles transcurridos
      slaPausadoAcumuladoSeg: 0,
      feriados: new Set(),
    })
    expect(resultado.unidad).toBe('dias_habiles')
    expect(resultado.transcurridoMs).toBe(4 * 24 * 60 * 60 * 1000)
    expect(resultado.plazoMs).toBe(3 * 24 * 60 * 60 * 1000) // 4 días hábiles > 3 de plazo
  })

  it('congela el cálculo en slaPausadoDesde cuando el SLA está pausado', () => {
    const resultado = calcularTranscurridoLote({
      prioridad: 'baja',
      slaIniciadoEn: '2026-07-13T00:00:00.000Z',
      slaPausadoDesde: '2026-07-14T00:00:00.000Z', // se pausó 1 día hábil después
      slaPausadoAcumuladoSeg: 0,
      feriados: new Set(),
    })
    expect(resultado.transcurridoMs).toBe(1 * 24 * 60 * 60 * 1000)
  })

  it('descuenta el feriado precargado del rango', () => {
    const resultado = calcularTranscurridoLote({
      prioridad: 'alta',
      slaIniciadoEn: '2026-08-10T00:00:00.000Z', // lunes feriado
      slaPausadoDesde: '2026-08-13T00:00:00.000Z', // jueves
      slaPausadoAcumuladoSeg: 0,
      feriados: new Set(['2026-08-10']),
    })
    expect(resultado.transcurridoMs).toBe(2 * 24 * 60 * 60 * 1000) // martes y miércoles
  })
})
