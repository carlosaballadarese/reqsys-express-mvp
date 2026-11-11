// Spec: SC-009-v2.md — CA-04 a CA-06, CA-09 (resaltado), RN-02 (sin query nueva)

import { VISTAS_VISTA_NP, vistasVistaNPVisibles } from '@/lib/vistas-vista-np'

describe('VISTAS_VISTA_NP — conjunto fijo', () => {
  it('tiene exactamente 3 vistas (Todas / Vencidas por SLA / En gestión)', () => {
    expect(VISTAS_VISTA_NP.map(v => v.label)).toEqual(['Todas', 'Vencidas por SLA', 'En gestión'])
  })

  it('cada construirHref produce una URL con un valor de filtro real de GET /api/compras/nps/vista', () => {
    const hrefs = VISTAS_VISTA_NP.map(v => v.construirHref({ id: 'x', rol: 'compras' }))
    expect(hrefs).toEqual(['/compras/vista-np', '/compras/vista-np?sla=vencido', '/compras/vista-np?estado=en_gestion'])
  })
})

describe('vistasVistaNPVisibles — filtrado por rol (= ROLES_VISTA de np-vista-query.ts)', () => {
  it('compras/admin/asistente_compras/gerencia/consulta ven las 3 vistas', () => {
    for (const rol of ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta'] as const) {
      expect(vistasVistaNPVisibles({ id: 'x', rol }).map(v => v.label)).toEqual(['Todas', 'Vencidas por SLA', 'En gestión'])
    }
  })

  it('solicitante/bodega/coordinador no ven ninguna (sin acceso a /compras/vista-np)', () => {
    for (const rol of ['solicitante', 'bodega', 'coordinador'] as const) {
      expect(vistasVistaNPVisibles({ id: 'x', rol })).toEqual([])
    }
  })
})

describe('esActiva — resaltado de vista activa (CA-09)', () => {
  const [todas, vencidas, enGestion] = VISTAS_VISTA_NP

  it('"Todas" está activa sin ningún query param', () => {
    expect(todas.esActiva(new URLSearchParams())).toBe(true)
    expect(todas.esActiva(new URLSearchParams('estado=todos&sla=todos'))).toBe(true)
  })

  it('"Todas" NO está activa si estado o sla tienen un valor específico', () => {
    expect(todas.esActiva(new URLSearchParams('estado=en_gestion'))).toBe(false)
    expect(todas.esActiva(new URLSearchParams('sla=vencido'))).toBe(false)
  })

  it('"Vencidas por SLA" está activa solo con sla=vencido, sin importar otros params', () => {
    expect(vencidas.esActiva(new URLSearchParams('sla=vencido'))).toBe(true)
    expect(vencidas.esActiva(new URLSearchParams('sla=vencido&area=TI'))).toBe(true)
    expect(vencidas.esActiva(new URLSearchParams('sla=a_tiempo'))).toBe(false)
  })

  it('"En gestión" está activa solo con estado=en_gestion', () => {
    expect(enGestion.esActiva(new URLSearchParams('estado=en_gestion'))).toBe(true)
    expect(enGestion.esActiva(new URLSearchParams('estado=aprobada'))).toBe(false)
  })
})

describe('contar — sobre un arreglo base ya cargado (RN-02, sin endpoint nuevo)', () => {
  const [todas, vencidas, enGestion] = VISTAS_VISTA_NP
  const filas = [
    { estado: 'en_gestion', sla_badge: 'vencido' as const },
    { estado: 'en_gestion', sla_badge: 'a_tiempo' as const },
    { estado: 'aprobada', sla_badge: 'vencido' as const },
    { estado: 'completada', sla_badge: 'no_activo' as const },
  ]

  it('"Todas" cuenta el arreglo completo', () => {
    expect(todas.contar(filas)).toBe(4)
  })

  it('"Vencidas por SLA" cuenta solo sla_badge=vencido', () => {
    expect(vencidas.contar(filas)).toBe(2)
  })

  it('"En gestión" cuenta solo estado=en_gestion', () => {
    expect(enGestion.contar(filas)).toBe(2)
  })
})
