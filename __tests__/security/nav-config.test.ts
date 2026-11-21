// Spec: SC-008-v2.md — CA-01, CA-06, CA-07, CA-08, CA-09, CA-10, CA-11

import { NAV, gruposVisibles, itemsVisibles, subitemsVisibles, type Rol } from '@/lib/nav-config'

const TODOS: Rol[] = ['solicitante', 'bodega', 'coordinador', 'asistente_compras', 'compras', 'gerencia', 'consulta', 'admin']

function grupo(label: string) {
  const g = NAV.find(g => g.label === label)
  if (!g) throw new Error(`grupo no encontrado: ${label}`)
  return g
}

// Spec: subgrupo de 2do nivel (2026-11-20) — "Movimientos"/"Catálogos" dentro
// de "Bodega". Busca en la estructura cruda (no filtrada por rol).
function subgrupo(label: string) {
  const item = (grupo('Bodega').children ?? []).find(c => c.label === label)
  if (!item) throw new Error(`subgrupo no encontrado: ${label}`)
  return item
}

describe('NAV — estructura general', () => {
  it('tiene exactamente 7 íconos de nivel superior, en el orden especificado', () => {
    expect(NAV.map(g => g.label)).toEqual(['Inicio', 'NPs', 'Compras', 'Bodega', 'OCA', 'Reportes', 'Configuración'])
  })
})

describe('CA-01: Inicio visible para los 8 roles', () => {
  it.each(TODOS)('rol %s ve el ícono Inicio', (rol) => {
    expect(gruposVisibles(rol).map(g => g.label)).toContain('Inicio')
  })
})

describe('CA-06: ícono Compras sin Reporte de Líneas', () => {
  it('Compras conserva Órdenes de Compra y Líneas Pendientes (Proveedores se mudó a Bodega en HU-026), sin Reporte de Líneas', () => {
    const labels = (grupo('Compras').children ?? []).map(c => c.label)
    expect(labels).toEqual(['Órdenes de Compra', 'Líneas Pendientes de OC'])
  })
})

describe('HU-026/post-SRS: catálogos base de Bodega en el nav, reagrupado en 2 niveles (2026-11-20)', () => {
  it('Bodega tiene 4 ítems de nivel superior: Kardex, Movimientos, Inventario, Catálogos', () => {
    const labels = (grupo('Bodega').children ?? []).map(c => c.label)
    expect(labels).toEqual(['Kardex', 'Movimientos', 'Inventario', 'Catálogos'])
  })

  it('"Movimientos" agrupa Documentos de Ingreso/Egreso + Ensamblajes (Field Build)', () => {
    const labels = subgrupo('Movimientos').children!.map(c => c.label)
    expect(labels).toEqual(['Documentos de Ingreso', 'Documentos de Egreso', 'Ensamblajes (Field Build)'])
  })

  it('"Catálogos" agrupa Categorías/Bodegas/Tipos de Ingreso/Tipos de Egreso/Clientes Finales/Lugar de Entrega/Proveedores (movido desde Compras)', () => {
    const labels = subgrupo('Catálogos').children!.map(c => c.label)
    expect(labels).toEqual([
      'Categorías', 'Bodegas', 'Tipos de Ingreso', 'Tipos de Egreso',
      'Clientes Finales', 'Lugar de Entrega', 'Proveedores',
    ])
  })

  it('Proveedores conserva exactamente los mismos roles que tenía bajo Compras', () => {
    const proveedores = subgrupo('Catálogos').children!.find(c => c.label === 'Proveedores')!
    expect(proveedores.href).toBe('/compras/proveedores')
    expect(proveedores.roles).toEqual(['compras', 'admin', 'asistente_compras'])
  })

  it('Bodegas y Categorías son solo compras/admin; Clientes Finales y Lugar de Entrega también incluyen bodega', () => {
    const porLabel = (label: string) => subgrupo('Catálogos').children!.find(c => c.label === label)!
    expect(porLabel('Bodegas').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Categorías').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Clientes Finales').roles).toEqual(['compras', 'admin', 'bodega'])
    expect(porLabel('Lugar de Entrega').roles).toEqual(['compras', 'admin', 'bodega'])
    expect(porLabel('Lugar de Entrega').href).toBe('/compras/bodega/puntos-entrega')
  })

  it('bodega ve el subgrupo Movimientos con sus 3 hijos, y Catálogos acotado a Clientes Finales + Lugar de Entrega', () => {
    const topItems = itemsVisibles(grupo('Bodega'), 'bodega').map(i => i.label)
    // Spec: HU-028 CA-02/CA-03/CA-08 — bodega también escribe Documentos de
    // Ingreso/Kardex; HU-030 CA-01 agrega Documentos de Egreso; HU-031 CA-01
    // agrega Ensamblajes. HU-037 CA-06: bodega no ve Tipos de Ingreso/Egreso.
    expect(topItems).toEqual(['Kardex', 'Movimientos', 'Inventario', 'Catálogos'])
    expect(subitemsVisibles(subgrupo('Movimientos'), 'bodega').map(i => i.label)).toEqual([
      'Documentos de Ingreso', 'Documentos de Egreso', 'Ensamblajes (Field Build)',
    ])
    expect(subitemsVisibles(subgrupo('Catálogos'), 'bodega').map(i => i.label)).toEqual([
      'Clientes Finales', 'Lugar de Entrega',
    ])
  })

  it('gerencia no ve Movimientos ni Catálogos (0 hijos visibles) — Bodega colapsa a solo Inventario', () => {
    const topItems = itemsVisibles(grupo('Bodega'), 'gerencia').map(i => i.label)
    expect(topItems).toEqual(['Inventario'])
  })

  it('asistente_compras: Movimientos queda acotado a Documentos de Ingreso, Catálogos a Proveedores', () => {
    expect(subitemsVisibles(subgrupo('Movimientos'), 'asistente_compras').map(i => i.label)).toEqual(['Documentos de Ingreso'])
    expect(subitemsVisibles(subgrupo('Catálogos'), 'asistente_compras').map(i => i.label)).toEqual(['Proveedores'])
  })
})

describe('HU-037: Tipos de Ingreso/Egreso en el nav (dentro del subgrupo Catálogos)', () => {
  it('son solo compras/admin, mismo criterio que Bodegas/Categorías', () => {
    const porLabel = (label: string) => subgrupo('Catálogos').children!.find(c => c.label === label)!
    expect(porLabel('Tipos de Ingreso').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Tipos de Ingreso').href).toBe('/compras/bodega/tipos-ingreso')
    expect(porLabel('Tipos de Egreso').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Tipos de Egreso').href).toBe('/compras/bodega/tipos-egreso')
  })

  it.each(['bodega', 'asistente_compras', 'gerencia', 'consulta'] as Rol[])('rol %s no ve Tipos de Ingreso ni Tipos de Egreso', (rol) => {
    const items = subitemsVisibles(subgrupo('Catálogos'), rol).map(i => i.label)
    expect(items).not.toContain('Tipos de Ingreso')
    expect(items).not.toContain('Tipos de Egreso')
  })
})

describe('HU-028: Documentos de Ingreso y Kardex en el nav', () => {
  it('visibles para bodega/asistente_compras/compras/admin, no para gerencia', () => {
    const documentoIngreso = subgrupo('Movimientos').children!.find(c => c.label === 'Documentos de Ingreso')!
    const kardex = (grupo('Bodega').children ?? []).find(c => c.label === 'Kardex')!
    expect(documentoIngreso.roles).toEqual(['compras', 'admin', 'bodega', 'asistente_compras'])
    expect(kardex.roles).toEqual(['compras', 'admin', 'bodega', 'asistente_compras'])
  })
})

describe('HU-030: Documentos de Egreso en el nav', () => {
  it('visible para bodega/compras/admin, sin asistente_compras ni gerencia', () => {
    const documentoEgreso = subgrupo('Movimientos').children!.find(c => c.label === 'Documentos de Egreso')!
    expect(documentoEgreso.roles).toEqual(['compras', 'admin', 'bodega'])
  })
})

describe('HU-031: Ensamblajes (Field Build) en el nav', () => {
  it('visible para bodega/compras/admin, sin asistente_compras ni gerencia', () => {
    const ensamblajes = subgrupo('Movimientos').children!.find(c => c.label === 'Ensamblajes (Field Build)')!
    expect(ensamblajes.roles).toEqual(['compras', 'admin', 'bodega'])
  })
})

describe('CA-07: ícono OCA sin Reportes ni Dashboard', () => {
  it('OCA conserva Mis OCAs y Releases pendientes, sin Reportes ni Dashboard', () => {
    const labels = (grupo('OCA').children ?? []).map(c => c.label)
    expect(labels).toEqual(['Mis OCAs', 'Releases pendientes'])
  })
})

describe('CA-08/CA-09: contenido de Reportes filtrado por rol', () => {
  // Spec: HU-035 — "Reportes de Bodega" (consolida Stock Bajo Mínimo de
  // HU-033 + los 4 reportes nuevos en un hub) tiene roles propios
  // (bodega/compras/admin/gerencia/consulta), distintos de ROLES_REPORTES_COMPLETOS
  // (sin bodega/consulta, pero con asistente_compras) — ya no hay una bipartición
  // uniforme "completos/limitados" para todo el grupo.
  const completosConBodega: Rol[] = ['compras', 'admin', 'gerencia']
  const limitados: Rol[] = ['solicitante', 'coordinador']

  it.each(completosConBodega)('rol %s ve las 6 entradas completas de Reportes + Reportes de Bodega', (rol) => {
    const items = itemsVisibles(grupo('Reportes'), rol).map(i => i.label)
    expect(items).toEqual([
      'Dashboard de NPs', 'Dashboard de OCs', 'Dashboard de OCA', 'Dashboard de Bodega',
      'Reporte de Líneas (NP/OC/OCA)', 'Reportes de OCA', 'Reportes de Bodega',
    ])
  })

  it('rol asistente_compras ve las 5 entradas completas, sin Dashboard/Reportes de Bodega (HU-035/HU-038 no lo incluyen)', () => {
    const items = itemsVisibles(grupo('Reportes'), 'asistente_compras').map(i => i.label)
    expect(items).toEqual([
      'Dashboard de NPs', 'Dashboard de OCs', 'Dashboard de OCA',
      'Reporte de Líneas (NP/OC/OCA)', 'Reportes de OCA',
    ])
  })

  it.each(limitados)('rol %s ve únicamente Dashboard de NPs dentro de Reportes', (rol) => {
    const items = itemsVisibles(grupo('Reportes'), rol).map(i => i.label)
    expect(items).toEqual(['Dashboard de NPs'])
  })

  it.each(['bodega', 'consulta'] as Rol[])('rol %s ve Dashboard de NPs + Dashboard/Reportes de Bodega (HU-035/HU-038)', (rol) => {
    const items = itemsVisibles(grupo('Reportes'), rol).map(i => i.label)
    expect(items).toEqual(['Dashboard de NPs', 'Dashboard de Bodega', 'Reportes de Bodega'])
  })

  it.each(TODOS)('el ícono Reportes en sí es visible para todos los roles (%s)', (rol) => {
    expect(gruposVisibles(rol).map(g => g.label)).toContain('Reportes')
  })
})

describe('CA-10: asistente_compras gana Bodega', () => {
  it('asistente_compras ve el ícono Bodega', () => {
    expect(gruposVisibles('asistente_compras').map(g => g.label)).toContain('Bodega')
  })

  it('solicitante/coordinador/consulta no ven Bodega (sin cambios)', () => {
    for (const rol of ['solicitante', 'coordinador', 'consulta'] as Rol[]) {
      expect(gruposVisibles(rol).map(g => g.label)).not.toContain('Bodega')
    }
  })
})

describe('CA-11: coordinador gana visibilidad de OCA', () => {
  it('coordinador ve el ícono OCA con Mis OCAs y Releases pendientes', () => {
    expect(gruposVisibles('coordinador').map(g => g.label)).toContain('OCA')
    const items = itemsVisibles(grupo('OCA'), 'coordinador').map(i => i.label)
    expect(items).toEqual(['Mis OCAs', 'Releases pendientes'])
  })
})

describe('Regresión: NPs y Configuración sin cambios de autorización', () => {
  it('Nueva NP sigue excluyendo solo a consulta', () => {
    const nuevaNp = (grupo('NPs').children ?? []).find(c => c.label === 'Nueva NP')!
    expect(nuevaNp.roles).toEqual(['solicitante', 'bodega', 'compras', 'admin', 'asistente_compras', 'coordinador', 'gerencia'])
    expect(nuevaNp.roles).not.toContain('consulta')
  })

  it('Configuración sigue restringida a compras/admin', () => {
    expect(grupo('Configuración').roles).toEqual(['compras', 'admin'])
  })
})
