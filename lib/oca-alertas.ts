// Spec: HU-024-v1.md — 3 indicadores visuales calculados al navegar, sin
// infraestructura de notificación proactiva (decisión de Fase 1: el proyecto
// no tiene cron/email automático, todo es reactivo a una acción de usuario).

export const UMBRALES_PRESUPUESTO = [100, 90, 80] as const
export const UMBRAL_VIGENCIA_DIAS = 15
export const UMBRAL_RELEASE_PENDIENTE_HORAS = 24

export type AlertaPresupuesto = '100' | '90' | '80' | null

// Spec: HU-024 CA-01/RN-01 — solo tiene sentido en OCA vigente/agotada
// (ejecutando presupuesto); primer umbral que coincide, de mayor a menor.
export function calcularAlertaPresupuesto(porcentajeEjecucion: number, estadoOca: string): AlertaPresupuesto {
  if (!['vigente', 'agotada'].includes(estadoOca)) return null
  for (const umbral of UMBRALES_PRESUPUESTO) {
    if (porcentajeEjecucion >= umbral) return String(umbral) as AlertaPresupuesto
  }
  return null
}

// Spec: HU-024 CA-02/RN-02 — solo true si la OCA está vigente y faltan
// <= 15 días para fecha_fin (una OCA ya vencida tiene su propio estado).
export function calcularAlertaVigencia(fechaFin: string, estadoOca: string, ahora: Date = new Date()): boolean {
  if (estadoOca !== 'vigente') return false
  const msPorDia = 24 * 60 * 60 * 1000
  const diasRestantes = (new Date(fechaFin).getTime() - ahora.getTime()) / msPorDia
  return diasRestantes >= 0 && diasRestantes <= UMBRAL_VIGENCIA_DIAS
}

// Spec: HU-024 CA-03/RN-03 — solo true si el release sigue pendiente_aprobacion
// y pasaron > 24h desde su creación. Requisito nuevo confirmado por el
// usuario, no derivado del documento fuente de OCA.
export function calcularAlertaReleasePendiente(createdAt: string, estadoRelease: string, ahora: Date = new Date()): boolean {
  if (estadoRelease !== 'pendiente_aprobacion') return false
  const msTranscurridos = ahora.getTime() - new Date(createdAt).getTime()
  return msTranscurridos > UMBRAL_RELEASE_PENDIENTE_HORAS * 60 * 60 * 1000
}
