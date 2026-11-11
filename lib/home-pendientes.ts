// Spec: SC-008-v2.md — CA-04, CA-05. Funciones puras: reciben datos ya
// obtenidos de los endpoints existentes (GET /api/compras/nps,
// /api/compras/ordenes, /api/compras/ocas, /api/compras/ocas/[id]/enmiendas)
// y arman la lista de "Pendientes de mi aprobación" — sin hacer fetch propio
// ni agregar ninguna lógica de negocio nueva (RN-03).

export type PendienteAprobacionItem = {
  tipo: 'np' | 'oc' | 'oca'
  numero: string
  href: string
  monto?: number
}

type NPPendiente = { id: string; numero: string; estado: string; total_estimado?: number | null }
type OCPendiente = { id: string; numero_oc: string; estado_oc: string; valor_total?: number | null }
type OCAPendiente = { id: string; numero_oca: string; estado: string }

// Spec CA-04 — NPs de su área en estado 'pendiente' (ya vienen filtradas por
// área del coordinador desde GET /api/compras/nps, ver lib/np-area.ts).
export function pendientesParaCoordinador(nps: NPPendiente[]): PendienteAprobacionItem[] {
  return nps
    .filter(np => np.estado === 'pendiente')
    .map(np => ({
      tipo: 'np' as const,
      numero: np.numero,
      href: `/compras/${np.id}`,
      monto: np.total_estimado ?? undefined,
    }))
}

// Spec CA-05 — OCs > $2,000 en en_aprobacion_gerencia (el monto ya viene
// filtrado por el propio flujo de aprobación, que enruta a gerencia solo
// por encima de ese umbral — no se revalida aquí) y OCAs en en_aprobacion.
//
// Spec: SC-008-v4.md — desviación aprobada (Fase 4): se retiran las
// Enmiendas de OCA de esta sección. No existe ningún endpoint que liste
// enmiendas pendientes a nivel global (solo GET .../ocas/[id]/enmiendas,
// por OCA individual) — cubrirlo exigiría un endpoint de agregación nuevo
// (contradice RN-03) o un bucle N+1 sobre todas las OCAs del sistema.
export function pendientesParaGerencia(
  ocs: OCPendiente[],
  ocas: OCAPendiente[]
): PendienteAprobacionItem[] {
  const deOcs: PendienteAprobacionItem[] = ocs
    .filter(oc => oc.estado_oc === 'en_aprobacion_gerencia')
    .map(oc => ({
      tipo: 'oc' as const,
      numero: oc.numero_oc,
      href: `/compras/ordenes/${oc.id}`,
      monto: oc.valor_total ?? undefined,
    }))

  const deOcas: PendienteAprobacionItem[] = ocas
    .filter(oca => oca.estado === 'en_aprobacion')
    .map(oca => ({
      tipo: 'oca' as const,
      numero: oca.numero_oca,
      href: `/compras/ocas/${oca.id}`,
    }))

  return [...deOcs, ...deOcas]
}
