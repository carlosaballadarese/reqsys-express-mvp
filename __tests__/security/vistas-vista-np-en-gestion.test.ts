// Spec: SC-010-v2.md — tests unitarios puros (sin mocks de Supabase) de la
// 4ª Vista "En gestión (asignadas a mí)" agregada a VISTAS_VISTA_NP.
import { VISTAS_VISTA_NP, vistasVistaNPVisibles } from '@/lib/vistas-vista-np'

describe('VISTAS_VISTA_NP — "En gestión (asignadas a mí)" (SC-010)', () => {
  const vista = VISTAS_VISTA_NP.find(v => v.label === 'En gestión (asignadas a mí)')!

  it('existe la vista con el label exacto', () => {
    expect(vista).toBeDefined()
  })

  // Spec: SC-010-v2.md RN-03, ajustado en sdd-design.md Decisión 1
  it('rolesVisibles incluye compras/admin/asistente_compras', () => {
    expect(vista.rolesVisibles).toEqual(['compras', 'admin', 'asistente_compras'])
  })

  it('rolesVisibles excluye gerencia y consulta (nunca pueden tener asignado_a)', () => {
    expect(vista.rolesVisibles).not.toContain('gerencia')
    expect(vista.rolesVisibles).not.toContain('consulta')
  })

  it.each(['compras', 'admin', 'asistente_compras'] as const)(
    'vistasVistaNPVisibles incluye la vista para el rol %s',
    (rol) => {
      const visibles = vistasVistaNPVisibles({ id: 'user-1', rol })
      expect(visibles.some(v => v.label === 'En gestión (asignadas a mí)')).toBe(true)
    }
  )

  it.each(['gerencia', 'consulta'] as const)(
    'vistasVistaNPVisibles excluye la vista para el rol %s',
    (rol) => {
      const visibles = vistasVistaNPVisibles({ id: 'user-1', rol })
      expect(visibles.some(v => v.label === 'En gestión (asignadas a mí)')).toBe(false)
    }
  )

  describe('construirHref', () => {
    it('genera la URL con estado=en_gestion y comprador=<perfil.id>', () => {
      const href = vista.construirHref({ id: 'user-42', rol: 'compras' })
      expect(href).toBe('/compras/vista-np?estado=en_gestion&comprador=user-42')
    })
  })

  describe('esActiva', () => {
    it('true solo cuando estado=en_gestion Y comprador=<ese userId exacto>', () => {
      const sp = new URLSearchParams('estado=en_gestion&comprador=user-42')
      expect(vista.esActiva(sp, 'user-42')).toBe(true)
    })

    it('false si comprador apunta a otro usuario', () => {
      const sp = new URLSearchParams('estado=en_gestion&comprador=otro-user')
      expect(vista.esActiva(sp, 'user-42')).toBe(false)
    })

    it('false si estado no es en_gestion aunque comprador coincida', () => {
      const sp = new URLSearchParams('estado=aprobada&comprador=user-42')
      expect(vista.esActiva(sp, 'user-42')).toBe(false)
    })

    it('false sin ningún query param', () => {
      const sp = new URLSearchParams('')
      expect(vista.esActiva(sp, 'user-42')).toBe(false)
    })
  })

  describe('contar', () => {
    it('cuenta solo filas con estado en_gestion y asignado_a === userId', () => {
      const filas = [
        { estado: 'en_gestion', sla_badge: 'a_tiempo' as const, asignado_a: 'user-42' },
        { estado: 'en_gestion', sla_badge: 'a_tiempo' as const, asignado_a: 'otro-user' },
        { estado: 'aprobada',   sla_badge: 'no_activo' as const, asignado_a: 'user-42' },
      ]
      expect(vista.contar(filas, 'user-42')).toBe(1)
    })

    it('devuelve 0 cuando no hay coincidencias', () => {
      const filas = [
        { estado: 'en_gestion', sla_badge: 'a_tiempo' as const, asignado_a: 'otro-user' },
      ]
      expect(vista.contar(filas, 'user-42')).toBe(0)
    })

    it('devuelve 0 con un array vacío', () => {
      expect(vista.contar([], 'user-42')).toBe(0)
    })
  })
})

describe('VISTAS_VISTA_NP — regresión de las 3 vistas existentes (SC-010 extiende esActiva/contar)', () => {
  const filas = [
    { estado: 'en_gestion', sla_badge: 'vencido' as const, asignado_a: 'user-42' },
    { estado: 'aprobada',   sla_badge: 'a_tiempo' as const, asignado_a: null },
  ]

  it('"Todas" ignora el 2º parámetro userId y mantiene su comportamiento', () => {
    const vista = VISTAS_VISTA_NP.find(v => v.label === 'Todas')!
    expect(vista.esActiva(new URLSearchParams(''), 'cualquier-id')).toBe(true)
    expect(vista.contar(filas, 'cualquier-id')).toBe(2)
  })

  it('"Vencidas por SLA" ignora el 2º parámetro userId y mantiene su comportamiento', () => {
    const vista = VISTAS_VISTA_NP.find(v => v.label === 'Vencidas por SLA')!
    expect(vista.esActiva(new URLSearchParams('sla=vencido'), 'cualquier-id')).toBe(true)
    expect(vista.contar(filas, 'cualquier-id')).toBe(1)
  })

  it('"En gestión" (global) ignora el 2º parámetro userId y mantiene su comportamiento', () => {
    const vista = VISTAS_VISTA_NP.find(v => v.label === 'En gestión')!
    expect(vista.esActiva(new URLSearchParams('estado=en_gestion'), 'cualquier-id')).toBe(true)
    expect(vista.contar(filas, 'cualquier-id')).toBe(1)
  })
})
