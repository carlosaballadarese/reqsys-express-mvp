// Spec: SC-009-v2.md — vistas fijas de acceso rápido para /compras/vista-np
// (Vista por NP, HU-011). Mismo patrón que lib/vistas-mis-nps.ts.

import type { Rol } from './nav-config'

export type PerfilVista = { id: string; rol: Rol }
type SlaBadge = 'no_activo' | 'pausado' | 'a_tiempo' | 'vencido'
type FilaBase = { estado: string; sla_badge: SlaBadge }

export type VistaVistaNP = {
  label: string
  rolesVisibles?: Rol[]
  construirHref: (perfil: PerfilVista) => string
  esActiva: (searchParams: URLSearchParams) => boolean
  contar: (filas: FilaBase[]) => number
}

// Espejo local de ROLES_VISTA de lib/np-vista-query.ts — no se importa
// directamente porque ese módulo toca adminClient() (service-role key) y
// este archivo lo consume un componente 'use client' (mismo criterio ya
// aplicado a ESTADOS_NP_ABIERTA_A_OC/ESTADOS_DEVOLVIBLES, ver CLAUDE.md).
const ROLES_VISTA_NP: Rol[] = ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta']

export const VISTAS_VISTA_NP: VistaVistaNP[] = [
  {
    label: 'Todas',
    rolesVisibles: ROLES_VISTA_NP,
    construirHref: () => '/compras/vista-np',
    esActiva: (sp) => (!sp.get('estado') || sp.get('estado') === 'todos') && (!sp.get('sla') || sp.get('sla') === 'todos'),
    contar: (filas) => filas.length,
  },
  {
    label: 'Vencidas por SLA',
    rolesVisibles: ROLES_VISTA_NP,
    construirHref: () => '/compras/vista-np?sla=vencido',
    esActiva: (sp) => sp.get('sla') === 'vencido',
    contar: (filas) => filas.filter(f => f.sla_badge === 'vencido').length,
  },
  {
    label: 'En gestión',
    rolesVisibles: ROLES_VISTA_NP,
    construirHref: () => '/compras/vista-np?estado=en_gestion',
    esActiva: (sp) => sp.get('estado') === 'en_gestion',
    contar: (filas) => filas.filter(f => f.estado === 'en_gestion').length,
  },
]

export function vistasVistaNPVisibles(perfil: PerfilVista): VistaVistaNP[] {
  return VISTAS_VISTA_NP.filter(v => !v.rolesVisibles || v.rolesVisibles.includes(perfil.rol))
}
