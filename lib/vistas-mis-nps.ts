// Spec: SC-009-v2.md — vistas fijas de acceso rápido para /compras (Mis NPs),
// mismo patrón que lib/vistas-guardadas.ts (SC-008) pero con 2 capacidades
// que esa interfaz no necesita: esActiva (CA-09, resaltado) y contar
// (sobre un arreglo ya cargado, sin query nueva — RN-02).

import type { Rol } from './nav-config'

export type PerfilVista = { id: string; rol: Rol }
type NPBase = { estado: string }

export type VistaMisNPs = {
  label: string
  // Sin rolesVisibles: visible para los 8 roles con acceso a /compras.
  rolesVisibles?: Rol[]
  construirHref: (perfil: PerfilVista) => string
  esActiva: (searchParams: URLSearchParams) => boolean
  contar: (nps: NPBase[]) => number
}

export const VISTAS_MIS_NPS: VistaMisNPs[] = [
  {
    label: 'Todas',
    construirHref: () => '/compras',
    esActiva: (sp) => !sp.get('estado') || sp.get('estado') === 'todos',
    contar: (nps) => nps.length,
  },
  {
    label: 'Pendientes de aprobar',
    rolesVisibles: ['coordinador', 'compras', 'admin'],
    construirHref: () => '/compras?estado=pendiente',
    esActiva: (sp) => sp.get('estado') === 'pendiente',
    contar: (nps) => nps.filter(n => n.estado === 'pendiente').length,
  },
  {
    label: 'Completadas',
    construirHref: () => '/compras?estado=completada',
    esActiva: (sp) => sp.get('estado') === 'completada',
    contar: (nps) => nps.filter(n => n.estado === 'completada').length,
  },
]

export function vistasMisNPsVisibles(perfil: PerfilVista): VistaMisNPs[] {
  return VISTAS_MIS_NPS.filter(v => !v.rolesVisibles || v.rolesVisibles.includes(perfil.rol))
}
