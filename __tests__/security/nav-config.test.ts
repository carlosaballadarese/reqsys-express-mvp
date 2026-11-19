// Spec: SC-008-v2.md — CA-01, CA-06, CA-07, CA-08, CA-09, CA-10, CA-11

import { NAV, gruposVisibles, itemsVisibles, type Rol } from '@/lib/nav-config'

const TODOS: Rol[] = ['solicitante', 'bodega', 'coordinador', 'asistente_compras', 'compras', 'gerencia', 'consulta', 'admin']

function grupo(label: string) {
  const g = NAV.find(g => g.label === label)
  if (!g) throw new Error(`grupo no encontrado: ${label}`)
  return g
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

describe('HU-026: catálogos base de Bodega en el nav', () => {
  it('Bodega gana Proveedores (movido desde Compras) + Bodegas/Categorías/Clientes Finales/Pozos', () => {
    const labels = (grupo('Bodega').children ?? []).map(c => c.label)
    expect(labels).toEqual([
      'Inventario', 'Proveedores', 'Bodegas', 'Categorías', 'Clientes Finales', 'Pozos',
      // Spec: HU-028 CA-02/CA-03/CA-08
      'Documentos de Ingreso', 'Kardex',
      // Spec: HU-030 CA-01
      'Documentos de Egreso',
      // Spec: HU-031 CA-01
      'Ensamblajes (Field Build)',
    ])
  })

  it('Proveedores conserva exactamente los mismos roles que tenía bajo Compras', () => {
    const proveedores = (grupo('Bodega').children ?? []).find(c => c.label === 'Proveedores')!
    expect(proveedores.href).toBe('/compras/proveedores')
    expect(proveedores.roles).toEqual(['compras', 'admin', 'asistente_compras'])
  })

  it('Bodegas y Categorías son solo compras/admin; Clientes Finales y Pozos también incluyen bodega', () => {
    const porLabel = (label: string) => (grupo('Bodega').children ?? []).find(c => c.label === label)!
    expect(porLabel('Bodegas').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Categorías').roles).toEqual(['compras', 'admin'])
    expect(porLabel('Clientes Finales').roles).toEqual(['compras', 'admin', 'bodega'])
    expect(porLabel('Pozos').roles).toEqual(['compras', 'admin', 'bodega'])
  })

  it('bodega ve Clientes Finales y Pozos pero no Bodegas ni Categorías', () => {
    const items = itemsVisibles(grupo('Bodega'), 'bodega').map(i => i.label)
    // Spec: HU-028 CA-02/CA-03/CA-08 — bodega también escribe Documentos de
    // Ingreso/Kardex; HU-030 CA-01 agrega Documentos de Egreso; HU-031 CA-01
    // agrega Ensamblajes.
    expect(items).toEqual(['Inventario', 'Clientes Finales', 'Pozos', 'Documentos de Ingreso', 'Kardex', 'Documentos de Egreso', 'Ensamblajes (Field Build)'])
  })
})

describe('HU-028: Documentos de Ingreso y Kardex en el nav', () => {
  it('visibles para bodega/asistente_compras/compras/admin, no para gerencia', () => {
    const porLabel = (label: string) => (grupo('Bodega').children ?? []).find(c => c.label === label)!
    expect(porLabel('Documentos de Ingreso').roles).toEqual(['compras', 'admin', 'bodega', 'asistente_compras'])
    expect(porLabel('Kardex').roles).toEqual(['compras', 'admin', 'bodega', 'asistente_compras'])
  })
})

describe('HU-030: Documentos de Egreso en el nav', () => {
  it('visible para bodega/compras/admin, sin asistente_compras ni gerencia', () => {
    const porLabel = (label: string) => (grupo('Bodega').children ?? []).find(c => c.label === label)!
    expect(porLabel('Documentos de Egreso').roles).toEqual(['compras', 'admin', 'bodega'])
  })
})

describe('HU-031: Ensamblajes (Field Build) en el nav', () => {
  it('visible para bodega/compras/admin, sin asistente_compras ni gerencia', () => {
    const porLabel = (label: string) => (grupo('Bodega').children ?? []).find(c => c.label === label)!
    expect(porLabel('Ensamblajes (Field Build)').roles).toEqual(['compras', 'admin', 'bodega'])
  })
})

describe('CA-07: ícono OCA sin Reportes ni Dashboard', () => {
  it('OCA conserva Mis OCAs y Releases pendientes, sin Reportes ni Dashboard', () => {
    const labels = (grupo('OCA').children ?? []).map(c => c.label)
    expect(labels).toEqual(['Mis OCAs', 'Releases pendientes'])
  })
})

describe('CA-08/CA-09: contenido de Reportes filtrado por rol', () => {
  const completos: Rol[] = ['compras', 'admin', 'asistente_compras', 'gerencia']
  const limitados: Rol[] = ['solicitante', 'bodega', 'coordinador', 'consulta']

  it.each(completos)('rol %s ve las 5 entradas completas de Reportes', (rol) => {
    const items = itemsVisibles(grupo('Reportes'), rol).map(i => i.label)
    expect(items).toEqual([
      'Dashboard de NPs', 'Dashboard de OCs', 'Dashboard de OCA',
      'Reporte de Líneas (NP/OC/OCA)', 'Reportes de OCA',
    ])
  })

  it.each(limitados)('rol %s ve únicamente Dashboard de NPs dentro de Reportes', (rol) => {
    const items = itemsVisibles(grupo('Reportes'), rol).map(i => i.label)
    expect(items).toEqual(['Dashboard de NPs'])
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
