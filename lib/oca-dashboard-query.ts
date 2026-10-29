import { adminClient } from '@/lib/supabase/clients'
import {
  type FiltrosReporteOca,
  obtenerEstadoOcas,
  obtenerConsumoPorCentroCosto,
  obtenerDetalleReleases,
  type FilaEstadoOca,
} from '@/lib/oca-reportes-query'
import { calcularAlertaPresupuesto, calcularAlertaVigencia, calcularAlertaReleasePendiente } from '@/lib/oca-alertas'

// Spec: HU-025 — capa de composición pura, NO toca lib/oca-reportes-query.ts
// ni lib/oca-alertas.ts (ambos ya shippeados y validados, HU-023/HU-024 —
// cero riesgo de regresión sobre código en producción).

export type FiltrosDashboardOca = FiltrosReporteOca

export type ResumenDashboardOca = {
  kpis: {
    total: number
    por_estado: Record<string, number>
    presupuesto_total: number
    consumido_total: number
    disponible_total: number
    porcentaje_ejecucion_global: number
    releases_pendientes_con_alerta: number
  }
  porEstado: { estado: string; count: number }[]
  porCentroCosto: { area_nombre: string; monto_consumido: number; cantidad_releases: number }[]
  porMes: { mes: string; monto: number }[]
  ocasConAlerta: {
    id: string; numero_oca: string; proveedor_nombre: string; estado: string
    alerta_presupuesto: '100' | '90' | '80' | null; alerta_vigencia: boolean
  }[]
}

// Spec: HU-025 — mismo patrón de post-filtro ya usado por obtenerDetalleReleases()/
// obtenerConsumoPorCentroCosto() para proveedor_id: resuelve los ids candidatos con
// una query aparte en vez de extender las funciones ya shippeadas de HU-023.
async function ocaIdsHabilitadasParaArea(areaId: string): Promise<Set<string>> {
  const { data } = await adminClient().from('oca_areas_habilitadas').select('oca_id').eq('area_id', areaId)
  return new Set((data ?? []).map((r: { oca_id: string }) => r.oca_id))
}

export async function obtenerResumenDashboard(filtros: FiltrosDashboardOca): Promise<ResumenDashboardOca> {
  const [estadoOcas, consumoCentroCosto, releasesAprobados, releasesPendientes] = await Promise.all([
    obtenerEstadoOcas(filtros),
    obtenerConsumoPorCentroCosto(filtros),
    obtenerDetalleReleases({ ...filtros, estado: 'aprobado' }),
    obtenerDetalleReleases({ ...filtros, estado: 'pendiente_aprobacion' }),
  ])

  let ocas: FilaEstadoOca[] = estadoOcas
  let porCentroCosto = consumoCentroCosto
  let aprobados = releasesAprobados
  let pendientes = releasesPendientes

  if (filtros.area_id) {
    const idsHabilitadas = await ocaIdsHabilitadasParaArea(filtros.area_id)
    ocas = ocas.filter(o => idsHabilitadas.has(o.id))
    porCentroCosto = porCentroCosto.filter(c => c.area_id === filtros.area_id)
    // obtenerDetalleReleases ya soporta area_id nativamente (HU-023 CA-02);
    // se pasa en el filtro original de cada llamada de arriba, sin post-filtro aquí.
  }

  const porEstadoMap: Record<string, number> = {}
  let presupuestoTotal = 0
  let consumidoTotal = 0
  const ocasConAlerta: ResumenDashboardOca['ocasConAlerta'] = []

  for (const oca of ocas) {
    porEstadoMap[oca.estado] = (porEstadoMap[oca.estado] ?? 0) + 1
    presupuestoTotal += oca.presupuesto_total
    consumidoTotal += oca.consumido

    const alertaPresupuesto = calcularAlertaPresupuesto(oca.porcentaje_ejecucion, oca.estado)
    const alertaVigencia = calcularAlertaVigencia(oca.fecha_fin, oca.estado)
    if (alertaPresupuesto || alertaVigencia) {
      ocasConAlerta.push({
        id: oca.id, numero_oca: oca.numero_oca, proveedor_nombre: oca.proveedor_nombre, estado: oca.estado,
        alerta_presupuesto: alertaPresupuesto, alerta_vigencia: alertaVigencia,
      })
    }
  }

  const releasesPendientesConAlerta = pendientes.filter(r => calcularAlertaReleasePendiente(r.created_at, r.estado)).length

  // Spec: HU-025 CA-05 — agregación mensual de releases aprobados, últimos 12 meses
  // (única pieza de agregación nueva de esta HU, mismo patrón que porMes de dashboard-ocs).
  const porMesMap: Record<string, number> = {}
  for (const r of aprobados) {
    const mes = r.created_at.slice(0, 7)
    porMesMap[mes] = (porMesMap[mes] ?? 0) + r.monto_total
  }
  const porMes = Object.entries(porMesMap)
    .map(([mes, monto]) => ({ mes, monto }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12)

  const disponibleTotal = presupuestoTotal - consumidoTotal
  const porcentajeEjecucionGlobal = presupuestoTotal > 0 ? Math.round((consumidoTotal / presupuestoTotal) * 100) : 0

  return {
    kpis: {
      total: ocas.length,
      por_estado: porEstadoMap,
      presupuesto_total: presupuestoTotal,
      consumido_total: consumidoTotal,
      disponible_total: disponibleTotal,
      porcentaje_ejecucion_global: porcentajeEjecucionGlobal,
      releases_pendientes_con_alerta: releasesPendientesConAlerta,
    },
    porEstado: Object.entries(porEstadoMap).map(([estado, count]) => ({ estado, count })),
    porCentroCosto: porCentroCosto.map(c => ({
      area_nombre: c.area_nombre, monto_consumido: c.monto_consumido, cantidad_releases: c.cantidad_releases,
    })),
    porMes,
    ocasConAlerta,
  }
}
