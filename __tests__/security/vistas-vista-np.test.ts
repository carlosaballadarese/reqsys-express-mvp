// Spec: SC-009-v2.md — CA-04 a CA-06, CA-09 (resaltado), RN-02 (sin query nueva)

import { VISTAS_VISTA_NP, vistasVistaNPVisibles } from '@/lib/vistas-vista-np'

describe('VISTAS_VISTA_NP — conjunto fijo', () => {
  // Spec: SC-010-v2.md — se agrega la 4ª vista "En gestión (asignadas a mí)"
  it('tiene exactamente 4 vistas (Todas / Vencidas por SLA / En gestión / En gestión (asignadas a mí))', () => {
    expect(VISTAS_VISTA_NP.map(v => v.label)).toEqual([
      'Todas', 'Vencidas por SLA', 'En gestión', 'En gestión (asignadas a mí)',
    ])
  })

  it('cada construirHref produce una URL con un valor de filtro real de GET /api/compras/nps/vista', () => {
    const hrefs = VISTAS_VISTA_NP.map(v => v.construirHref({ id: 'x', rol: 'compras' }))
    expect(hrefs).toEqual([
      '/compras/vista-np',
      '/compras/vista-np?sla=vencido',
      '/compras/vista-np?estado=en_gestion',
      '/compras/vista-np?estado=en_gestion&comprador=x',
    ])
  })
})

describe('vistasVistaNPVisibles — filtrado por rol (= ROLES_VISTA de np-vista-query.ts)', () => {
  it('compras/admin/asistente_compras/gerencia/consulta ven las 3 vistas originales', () => {
    for (const rol of ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta'] as const) {
      const labels = vistasVistaNPVisibles({ id: 'x', rol }).map(v => v.label)
      expect(labels).toContain('Todas')
      expect(labels).toContain('Vencidas por SLA')
      expect(labels).toContain('En gestión')
    }
  })

  // Spec: SC-010-v2.md sdd-design.md Decisión 1 — acotado a los 3 roles que
  // realmente pueden tener asignado_a (gerencia/consulta nunca pueden).
  it.each(['compras', 'admin', 'asistente_compras'] as const)(
    '%s también ve "En gestión (asignadas a mí)"',
    (rol) => {
      expect(vistasVistaNPVisibles({ id: 'x', rol }).map(v => v.label)).toContain('En gestión (asignadas a mí)')
    }
  )

  it.each(['gerencia', 'consulta'] as const)(
    '%s NO ve "En gestión (asignadas a mí)" (nunca puede tener asignado_a)',
    (rol) => {
      expect(vistasVistaNPVisibles({ id: 'x', rol }).map(v => v.label)).not.toContain('En gestión (asignadas a mí)')
    }
  )

  it('solicitante/bodega/coordinador no ven ninguna (sin acceso a /compras/vista-np)', () => {
    for (const rol of ['solicitante', 'bodega', 'coordinador'] as const) {
      expect(vistasVistaNPVisibles({ id: 'x', rol })).toEqual([])
    }
  })
})

describe('esActiva — resaltado de vista activa (CA-09)', () => {
  const [todas, vencidas, enGestion] = VISTAS_VISTA_NP

  // Spec: SC-010-v2.md — esActiva gana un 2º parámetro userId (aditivo);
  // estas 3 vistas lo ignoran, se pasa un valor cualquiera para satisfacer la firma.
  it('"Todas" está activa sin ningún query param', () => {
    expect(todas.esActiva(new URLSearchParams(), 'user-x')).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=todos&sla=todos'), 'user-x')).toBe(true)
  })

  it('"Todas" NO está activa si estado o sla tienen un valor específico', () => {
    expect(todas.esActiva(new URLSearchParams('estado=en_gestion'), 'user-x')).toBe(false)
    expect(todas.esActiva(new URLSearchParams('sla=vencido'), 'user-x')).toBe(false)
  })

  it('"Vencidas por SLA" está activa solo con sla=vencido, sin importar otros params', () => {
    expect(vencidas.esActiva(new URLSearchParams('sla=vencido'), 'user-x')).toBe(true)
    expect(vencidas.esActiva(new URLSearchParams('sla=vencido&area=TI'), 'user-x')).toBe(true)
    expect(vencidas.esActiva(new URLSearchParams('sla=a_tiempo'), 'user-x')).toBe(false)
  })

  it('"En gestión" está activa solo con estado=en_gestion', () => {
    expect(enGestion.esActiva(new URLSearchParams('estado=en_gestion'), 'user-x')).toBe(true)
    expect(enGestion.esActiva(new URLSearchParams('estado=aprobada'), 'user-x')).toBe(false)
  })
})

describe('contar — sobre un arreglo base ya cargado (RN-02, sin endpoint nuevo)', () => {
  const [todas, vencidas, enGestion] = VISTAS_VISTA_NP
  const filas = [
    { estado: 'en_gestion', sla_badge: 'vencido' as const, asignado_a: null },
    { estado: 'en_gestion', sla_badge: 'a_tiempo' as const, asignado_a: null },
    { estado: 'aprobada', sla_badge: 'vencido' as const, asignado_a: null },
    { estado: 'completada', sla_badge: 'no_activo' as const, asignado_a: null },
  ]

  it('"Todas" cuenta el arreglo completo', () => {
    expect(todas.contar(filas, 'user-x')).toBe(4)
  })

  it('"Vencidas por SLA" cuenta solo sla_badge=vencido', () => {
    expect(vencidas.contar(filas, 'user-x')).toBe(2)
  })

  it('"En gestión" cuenta solo estado=en_gestion', () => {
    expect(enGestion.contar(filas, 'user-x')).toBe(2)
  })
})
