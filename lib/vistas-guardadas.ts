// Spec: SC-008-v2.md RN-02 — conjunto FIJO de atajos definidos en código, no
// un sistema de vistas persistentes/editables por el usuario (fuera de
// alcance de esta SC). Cada vista enlaza a una pantalla ya existente con
// filtros preaplicados vía query string.

import type { Rol } from './nav-config'

export type Perfil = { id: string; rol: Rol; area?: string | null }

export type VistaGuardada = {
  label: string
  // Sin rolesVisibles: visible para cualquier rol con acceso a "Inicio" (todos).
  rolesVisibles?: Rol[]
  construirHref: (perfil: Perfil) => string
}

// Spec: SC-008-v3.md — desviación aprobada (Fase 4): el conjunto se redujo
// de 6 a 4 vistas. Se retiraron "Sin comprador asignado" (lib/np-vista-query.ts
// no soporta filtrar por asignado_a IS NULL, ningún sentinel value existe
// hoy) y "OCAs por vencer" (app/compras/ocas/page.tsx no tiene ningún filtro
// de vigencia) — ambas habrían requerido inventar lógica de filtrado nueva
// no solicitada, en vez de reutilizar filtros ya existentes. Cada valor de
// query string de abajo está verificado contra el código real de su pantalla
// de destino (ESTADOS_NP en app/compras/page.tsx, SLA_LABEL en
// app/compras/vista-np/page.tsx, ESTADOS en app/compras/ordenes/page.tsx).
export const VISTAS_GUARDADAS: VistaGuardada[] = [
  {
    label: 'NPs pendientes de aprobar',
    rolesVisibles: ['compras', 'admin', 'asistente_compras'],
    construirHref: () => '/compras?estado=pendiente',
  },
  {
    label: 'Vencidas por SLA',
    rolesVisibles: ['compras', 'admin', 'asistente_compras', 'gerencia'],
    construirHref: () => '/compras/vista-np?sla=vencido',
  },
  {
    label: 'OCs en aprobación de gerencia',
    rolesVisibles: ['compras', 'admin', 'gerencia'],
    construirHref: () => '/compras/ordenes?estado=en_aprobacion_gerencia',
  },
  {
    label: 'Mis NPs pendientes',
    rolesVisibles: ['solicitante', 'bodega', 'coordinador'],
    construirHref: () => '/compras?estado=pendiente',
  },
]

export function vistasVisibles(perfil: Perfil): VistaGuardada[] {
  return VISTAS_GUARDADAS.filter(v => !v.rolesVisibles || v.rolesVisibles.includes(perfil.rol))
}

// Spec: feedback de usuario sobre el mockup — cada vista guardada debe
// mostrar cuántos resultados tiene, no solo el label. Los 3 insumos ya
// vienen de datos que Inicio obtiene de endpoints existentes (RN-03): la
// cuenta de NPs pendiente ya la usa el KPI "NPs pendientes"/"Mis NPs
// pendientes" (misma variable, reutilizada tal cual para ambas vistas que
// apuntan al mismo filtro); "Vencidas por SLA" reutiliza el propio filtro
// `?sla=vencido` de GET /api/compras/nps/vista (mismo que consume la
// pantalla de destino, sin reimplementar la lógica de SLA en el cliente).
export type ConteosVistas = {
  npsPendientes: number
  npsVencidasSla: number
  ocsEnAprobacionGerencia: number
}

export function contarVista(label: string, conteos: ConteosVistas): number | undefined {
  switch (label) {
    case 'NPs pendientes de aprobar':
    case 'Mis NPs pendientes':
      return conteos.npsPendientes
    case 'Vencidas por SLA':
      return conteos.npsVencidasSla
    case 'OCs en aprobación de gerencia':
      return conteos.ocsEnAprobacionGerencia
    default:
      return undefined
  }
}
