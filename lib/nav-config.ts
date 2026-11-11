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

export type ItemNav = { label: string; href: string; roles?: Rol[]; exact?: boolean }

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
      {
        label: 'Proveedores', href: '/compras/proveedores',
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
    children: [
      { label: 'Inventario', href: '/compras/inventario' },
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
      { label: 'Reporte de Líneas (NP/OC/OCA)', href: '/compras/reportes/lineas', roles: ROLES_REPORTES_COMPLETOS },
      { label: 'Reportes de OCA', href: '/compras/ocas/reportes', roles: ROLES_REPORTES_COMPLETOS },
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
    ],
  },
]

export function gruposVisibles(rol: Rol | ''): GrupoNav[] {
  return NAV.filter(g => g.roles.includes(rol as Rol))
}

export function itemsVisibles(grupo: GrupoNav, rol: Rol | ''): ItemNav[] {
  return (grupo.children ?? []).filter(c => !c.roles || c.roles.includes(rol as Rol))
}
