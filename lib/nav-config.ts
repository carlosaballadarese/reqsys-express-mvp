// Spec: SC-008-v2.md — estructura de navegación extraída de ComprasNav.tsx a
// funciones puras, testeables con Jest sin renderizar React (el proyecto no
// tiene infraestructura de tests de componentes).

export type Rol =
  | 'solicitante'
  | 'bodega'
  | 'coordinador'
  | 'asistente_compras'
  | 'compras'
  | 'gerencia'
  | 'consulta'
  | 'admin'

// Spec: subgrupo de 2do nivel a pedido del usuario (2026-11-20) — un ItemNav
// es o bien una hoja (`href`, sin `children`) o bien un subgrupo colapsable
// (`children`, sin `href` propio). No hay un 3er nivel.
export type ItemNav = { label: string; href?: string; roles?: Rol[]; exact?: boolean; children?: ItemNav[] }

export type GrupoNav = {
  label: string
  icono: 'inicio' | 'nps' | 'compras' | 'bodega' | 'oca' | 'reportes' | 'configuracion'
  roles: Rol[]
  href?: string
  exact?: boolean
  children?: ItemNav[]
}

const TODOS_LOS_ROLES: Rol[] = [
  'solicitante', 'bodega', 'coordinador', 'asistente_compras',
  'compras', 'gerencia', 'consulta', 'admin',
]

// Spec: SC-008 CA-08/CA-09 (RN-01) — roles con acceso completo a "Reportes"
// (idéntico a ROLES_REPORTES_OCA/ROLES_REPORTE_LINEAS/DASHBOARD_OCS_ROLES
// ya existentes en el backend).
const ROLES_REPORTES_COMPLETOS: Rol[] = ['compras', 'admin', 'asistente_compras', 'gerencia']

export const NAV: GrupoNav[] = [
  {
    label: 'Inicio',
    icono: 'inicio',
    href: '/compras/inicio',
    exact: true,
    roles: TODOS_LOS_ROLES,
  },
  {
    label: 'NPs',
    icono: 'nps',
    roles: TODOS_LOS_ROLES,
    children: [
      { label: 'Mis NPs', href: '/compras', exact: true },
      {
        label: 'Nueva NP', href: '/compras/nueva',
        roles: ['solicitante', 'bodega', 'compras', 'admin', 'asistente_compras', 'coordinador', 'gerencia'],
      },
      {
        label: 'Vista por NP', href: '/compras/vista-np',
        roles: ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta'],
      },
    ],
  },
  {
    label: 'Compras',
    icono: 'compras',
    roles: ['compras', 'admin', 'gerencia', 'consulta', 'asistente_compras'],
    children: [
      { label: 'Órdenes de Compra', href: '/compras/ordenes' },
      {
        label: 'Líneas Pendientes de OC', href: '/compras/lineas-pendientes',
        roles: ['compras', 'admin', 'asistente_compras'],
      },
    ],
  },
  {
    label: 'Bodega',
    icono: 'bodega',
    // Spec: SC-008 CA-10 — asistente_compras gana acceso (antes bloqueado
    // explícitamente en proxy.ts sin justificación de negocio documentada).
    roles: ['compras', 'admin', 'gerencia', 'bodega', 'asistente_compras'],
    // Spec: reagrupado en 2 niveles a pedido del usuario (2026-11-20) — el
    // listado plano de 12 ítems resultaba "muy extenso"; se agrupan por
    // prioridad de uso en 4 filas de nivel superior (Kardex/Movimientos/
    // Inventario/Catálogos), con "Movimientos" y "Catálogos" como subgrupos
    // colapsables (ItemNav.children de 2do nivel — ver itemsVisibles()/
    // subitemsVisibles() más abajo para cómo se calcula su visibilidad).
    children: [
      // Spec: HU-028 CA-02/CA-03/CA-08 — roles de escritura igualados con
      // asistente_compras (decisión de Fase 1); gerencia nunca participa del
      // ciclo operativo de ingresos/Kardex.
      {
        label: 'Kardex', href: '/compras/bodega/kardex',
        roles: ['compras', 'admin', 'bodega', 'asistente_compras'],
      },
      {
        label: 'Movimientos',
        children: [
          {
            label: 'Documentos de Ingreso', href: '/compras/bodega/ingresos',
            roles: ['compras', 'admin', 'bodega', 'asistente_compras'],
          },
          // Spec: HU-030 CA-01 — a diferencia de Documentos de Ingreso,
          // asistente_compras NO participa (un Egreso nunca está ligado a
          // una OC que gestione).
          {
            label: 'Documentos de Egreso', href: '/compras/bodega/egresos',
            roles: ['compras', 'admin', 'bodega'],
          },
          // Spec: HU-031 CA-01 — mismos roles que Egresos.
          {
            label: 'Ensamblajes (Field Build)', href: '/compras/bodega/ensamblajes',
            roles: ['compras', 'admin', 'bodega'],
          },
        ],
      },
      { label: 'Inventario', href: '/compras/inventario' },
      {
        label: 'Catálogos',
        children: [
          {
            label: 'Categorías', href: '/compras/bodega/categorias',
            roles: ['compras', 'admin'],
          },
          {
            label: 'Bodegas', href: '/compras/bodega/bodegas',
            roles: ['compras', 'admin'],
          },
          // Spec: HU-037 CA-06 — solo listado + toggle activo, sin alta de
          // tipo nuevo (RN-01) y sin DELETE físico (RN-03).
          {
            label: 'Tipos de Ingreso', href: '/compras/bodega/tipos-ingreso',
            roles: ['compras', 'admin'],
          },
          {
            label: 'Tipos de Egreso', href: '/compras/bodega/tipos-egreso',
            roles: ['compras', 'admin'],
          },
          {
            label: 'Clientes Finales', href: '/compras/bodega/clientes-finales',
            roles: ['compras', 'admin', 'bodega'],
          },
          // Spec: renombrado desde "Pozos" (2026-11-20) — nombre agnóstico de
          // industria para multiempresa; internamente "punto_entrega" (tabla
          // y columna), elegido tras descartar "destino" por colisión real
          // con `permiteDestino` ya usado en Egreso.
          {
            label: 'Lugar de Entrega', href: '/compras/bodega/puntos-entrega',
            roles: ['compras', 'admin', 'bodega'],
          },
          // Spec: HU-026 CA-11 — "Proveedores" se mueve aquí desde "Compras"
          // (mismo href/roles, solo cambia su ubicación visual en el menú).
          // Queda al final: es el catálogo menos específico de Bodega.
          {
            label: 'Proveedores', href: '/compras/proveedores',
            roles: ['compras', 'admin', 'asistente_compras'],
          },
        ],
      },
    ],
  },
  {
    label: 'OCA',
    icono: 'oca',
    // Spec: SC-008 CA-11 — coordinador gana visibilidad (proxy.ts ya
    // permitía la ruta desde HU-021, pero el nav nunca lo mostraba).
    roles: ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras', 'coordinador'],
    children: [
      { label: 'Mis OCAs', href: '/compras/ocas', exact: true },
      { label: 'Releases pendientes', href: '/compras/ocas/releases-pendientes' },
    ],
  },
  {
    label: 'Reportes',
    icono: 'reportes',
    // Spec: SC-008 CA-08/CA-09 — visible para los 8 roles; el contenido
    // interno (qué hijos ve cada uno) replica exactamente las restricciones
    // que cada reporte/dashboard ya tiene hoy en su ubicación original.
    roles: TODOS_LOS_ROLES,
    children: [
      // Sin `roles`: visible para los 8 (igual que "Dashboard NPs" hoy).
      { label: 'Dashboard de NPs', href: '/compras/dashboard', exact: true },
      { label: 'Dashboard de OCs', href: '/compras/dashboard-ocs', exact: true, roles: ROLES_REPORTES_COMPLETOS },
      { label: 'Dashboard de OCA', href: '/compras/ocas/dashboard', exact: true, roles: ROLES_REPORTES_COMPLETOS },
      // Spec: HU-038 CA-06 — mismos roles exactos que "Reportes de Bodega"
      // (ROLES_REPORTES_BODEGA), no ROLES_REPORTES_COMPLETOS.
      { label: 'Dashboard de Bodega', href: '/compras/bodega/dashboard', exact: true, roles: ['bodega', 'compras', 'admin', 'gerencia', 'consulta'] },
      { label: 'Reporte de Líneas (NP/OC/OCA)', href: '/compras/reportes/lineas', roles: ROLES_REPORTES_COMPLETOS },
      { label: 'Reportes de OCA', href: '/compras/ocas/reportes', roles: ROLES_REPORTES_COMPLETOS },
      // Spec: HU-033 CA-04 — roles propios del reporte (incluye bodega/
      // consulta, a diferencia de ROLES_REPORTES_COMPLETOS).
      // Spec: HU-035 — consolida "Stock Bajo Mínimo" (HU-033) + los 4 reportes
      // nuevos en un solo hub, mismo criterio que "Reportes de OCA"/"Reporte
      // de Líneas" (un hub por dominio, no un ítem de nav por reporte).
      { label: 'Reportes de Bodega', href: '/compras/bodega/reportes', roles: ['bodega', 'compras', 'admin', 'gerencia', 'consulta'] },
    ],
  },
  {
    label: 'Configuración',
    icono: 'configuracion',
    roles: ['compras', 'admin'],
    children: [
      { label: 'Áreas', href: '/compras/coordinadores' },
      { label: 'Numeraciones', href: '/compras/configuracion' },
      { label: 'Datos de Empresa', href: '/compras/empresa' },
      { label: 'Feriados', href: '/compras/feriados' },
      { label: 'Acciones', href: '/compras/acciones' },
      { label: 'Auditoría', href: '/compras/auditoria' },
      { label: 'Accesos', href: '/compras/accesos' },
      // Spec: HU-039 RN-06 — herramienta administrativa de uso ocasional,
      // mismo criterio que el resto de "Configuración" (no en "Bodega", que
      // se acaba de simplificar para uso operativo diario, 2026-11-20).
      { label: 'Análisis de Migración', href: '/compras/bodega/analisis-migracion' },
      // Spec: HU-041 CA-09 — mismo criterio que Análisis de Migración (alto
      // impacto, uso ocasional, admin/compras).
      { label: 'Reemplazo Total de Inventario', href: '/compras/bodega/reemplazo-inventario' },
    ],
  },
]

export function gruposVisibles(rol: Rol | ''): GrupoNav[] {
  return NAV.filter(g => g.roles.includes(rol as Rol))
}

function pasaRoles(roles: Rol[] | undefined, rol: Rol | ''): boolean {
  return !roles || roles.includes(rol as Rol)
}

// Spec: subgrupo de 2do nivel (2026-11-20) — hijos visibles de un ItemNav
// que a su vez es un subgrupo ("Movimientos"/"Catálogos"). Mismo filtro de
// roles que itemsVisibles(), pero sin el nivel GrupoNav.
export function subitemsVisibles(item: ItemNav, rol: Rol | ''): ItemNav[] {
  return (item.children ?? []).filter(c => pasaRoles(c.roles, rol))
}

// Spec: un subgrupo sin ningún hijo visible para el rol actual no debe
// contarse como "ítem visible" del grupo (ej. gerencia: "Movimientos" y
// "Catálogos" quedan en 0 hijos → el grupo "Bodega" colapsa a un solo link
// directo a "Inventario", mismo comportamiento de CA-19 ya existente).
export function itemsVisibles(grupo: GrupoNav, rol: Rol | ''): ItemNav[] {
  return (grupo.children ?? []).filter(c => {
    if (!pasaRoles(c.roles, rol)) return false
    if (c.children) return subitemsVisibles(c, rol).length > 0
    return true
  })
}
