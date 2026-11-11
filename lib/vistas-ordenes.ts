// Spec: SC-011-v2.md — vistas fijas de acceso rápido para /compras/ordenes,
// mismo patrón que lib/vistas-mis-nps.ts (SC-009), con una particularidad:
// "En aprobación" agrupa 2 valores reales de estado_oc que el backend no
// soporta combinar en una sola llamada (RN-02) — la página resuelve esto
// con un valor centinela ("en_aprobacion") que nunca se envía al backend,
// ver sdd-design.md Decisión 1.

import type { Rol } from './nav-config'

export type PerfilVistaOC = { rol: Rol }
type OCBase = { estado_oc: string }

export type VistaOrdenes = {
  label: string
  // Sin uso real hoy: las 4 vistas quedan visibles a los mismos 7 roles que
  // ya acceden a /compras/ordenes (RN-01 — el backend no aplica scope por rol).
  rolesVisibles?: Rol[]
  estados: string[]
  construirHref: () => string
  esActiva: (searchParams: URLSearchParams) => boolean
  contar: (ocs: OCBase[]) => number
}

export const EN_APROBACION = ['en_aprobacion_compras', 'en_aprobacion_gerencia']

export const VISTAS_ORDENES: VistaOrdenes[] = [
  {
    label: 'Todas',
    estados: [],
    construirHref: () => '/compras/ordenes',
    esActiva: (sp) => !sp.get('estado') || sp.get('estado') === 'todos',
    contar: (ocs) => ocs.length,
  },
  {
    label: 'En aprobación',
    estados: EN_APROBACION,
    construirHref: () => '/compras/ordenes?estado=en_aprobacion',
    // Spec: SC-011-v2.md CA-07 — reconoce también los 2 valores reales
    // individuales (deep-link ya existente de SC-008, que usa
    // en_aprobacion_gerencia solo, no el centinela), además del centinela
    // propio de esta SC (clic desde el panel Vistas).
    esActiva: (sp) => {
      const v = sp.get('estado') ?? ''
      return v === 'en_aprobacion' || EN_APROBACION.includes(v)
    },
    contar: (ocs) => ocs.filter(oc => EN_APROBACION.includes(oc.estado_oc)).length,
  },
  {
    label: 'Aprobadas',
    estados: ['aprobada'],
    construirHref: () => '/compras/ordenes?estado=aprobada',
    esActiva: (sp) => sp.get('estado') === 'aprobada',
    contar: (ocs) => ocs.filter(oc => oc.estado_oc === 'aprobada').length,
  },
  {
    label: 'Canceladas',
    estados: ['cancelada'],
    construirHref: () => '/compras/ordenes?estado=cancelada',
    esActiva: (sp) => sp.get('estado') === 'cancelada',
    contar: (ocs) => ocs.filter(oc => oc.estado_oc === 'cancelada').length,
  },
]

export function vistasOrdenesVisibles(perfil: PerfilVistaOC): VistaOrdenes[] {
  return VISTAS_ORDENES.filter(v => !v.rolesVisibles || v.rolesVisibles.includes(perfil.rol))
}
