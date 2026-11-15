// Spec: SC-016 RN-07 — alerta de antigüedad para OCs en_proceso, calculada
// en caliente al navegar (mismo patrón que lib/oca-alertas.ts, HU-024). El
// proyecto no tiene infraestructura de notificación proactiva (cron/email
// automático); el documento fuente solo pide un indicador visual.
export function calcularAlertaAntiguedadOC(
  createdAt: string,
  estadoOc: string,
  ahora: number = Date.now()
): boolean {
  if (estadoOc !== 'en_proceso') return false
  const dias = Math.floor((ahora - new Date(createdAt).getTime()) / 86400000)
  return dias >= 30
}
