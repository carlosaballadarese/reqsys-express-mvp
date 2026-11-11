'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { vistasVisibles, contarVista, type VistaGuardada } from '@/lib/vistas-guardadas'
import { pendientesParaCoordinador, pendientesParaGerencia, type PendienteAprobacionItem } from '@/lib/home-pendientes'
import { describirAuditoria, tiempoRelativo, type AuditoriaRow } from '@/lib/auditoria-texto'
import type { Rol } from '@/lib/nav-config'

type Perfil = { id: string; nombre: string; rol: string; email: string }
type NP = {
  id: string; numero: string; estado: string; total_estimado: number | null
  creado_por_id: string | null; solicitante_email: string | null
}
type OC = { id: string; numero_oc: string; estado_oc: string; valor_total: number | null }
type Oca = {
  id: string; numero_oca: string; estado: string
  alerta_presupuesto: string | null; alerta_vigencia: boolean
}
type ReleasePendiente = { oca_id: string; numero_oca: string | null; numero_release: string }

const ROLES_CON_OCS: string[] = ['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta']
const ROLES_CON_RELEASES: string[] = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras', 'coordinador']
// Spec: CA-02 — "Actividad reciente" solo para compras/admin, mismo gate
// de GET /api/compras/auditoria (RN-03: se reutiliza el endpoint existente,
// sin agregación nueva).
const ROLES_CON_ACTIVIDAD: string[] = ['compras', 'admin']
// Mismos roles que ven la vista guardada "Vencidas por SLA" (vistas-guardadas.ts)
const ROLES_CON_SLA: string[] = ['compras', 'admin', 'asistente_compras', 'gerencia']

export default function InicioPage() {
  const [perfil, setPerfil]       = useState<Perfil | null>(null)
  const [nps, setNps]             = useState<NP[]>([])
  const [ocs, setOcs]             = useState<OC[]>([])
  const [ocas, setOcas]           = useState<Oca[]>([])
  const [releases, setReleases]   = useState<ReleasePendiente[]>([])
  const [auditoria, setAuditoria] = useState<AuditoriaRow[]>([])
  const [npsVencidasSla, setNpsVencidasSla] = useState(0)
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPerfil(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!perfil) return
    const rol = perfil.rol

    async function cargar() {
      setCargando(true)
      const tareas: Promise<void>[] = [
        fetch('/api/compras/nps').then(r => r.ok ? r.json() : []).then(d => setNps(Array.isArray(d) ? d : [])),
      ]
      if (ROLES_CON_OCS.includes(rol)) {
        tareas.push(fetch('/api/compras/ordenes').then(r => r.ok ? r.json() : []).then(d => setOcs(Array.isArray(d) ? d : [])))
      }
      tareas.push(fetch('/api/compras/ocas').then(r => r.ok ? r.json() : []).then(d => setOcas(Array.isArray(d) ? d : [])))
      if (ROLES_CON_RELEASES.includes(rol)) {
        tareas.push(
          fetch('/api/compras/ocas/releases/pendientes')
            .then(r => r.ok ? r.json() : [])
            .then(d => setReleases(Array.isArray(d) ? d : []))
        )
      }
      if (ROLES_CON_ACTIVIDAD.includes(rol)) {
        tareas.push(
          fetch('/api/compras/auditoria')
            .then(r => r.ok ? r.json() : [])
            .then(d => setAuditoria(Array.isArray(d) ? d.slice(0, 5) : []))
        )
      }
      // Spec: conteo de la vista guardada "Vencidas por SLA" — reutiliza el
      // mismo filtro ?sla=vencido de la pantalla de destino (sin reimplementar
      // la lógica de SLA en el cliente, RN-03).
      if (ROLES_CON_SLA.includes(rol)) {
        tareas.push(
          fetch('/api/compras/nps/vista?sla=vencido')
            .then(r => r.ok ? r.json() : [])
            .then(d => setNpsVencidasSla(Array.isArray(d) ? d.length : 0))
        )
      }
      await Promise.all(tareas)
      setCargando(false)
    }
    cargar()
  }, [perfil])

  if (!perfil || cargando) {
    return <div className="p-8 text-sm text-slate-500">Cargando…</div>
  }

  const rol = perfil.rol

  // Spec: SC-008-v2.md CA-03 — solicitante/bodega ven únicamente sus
  // propias NPs. GET /api/compras/nps no escopea a bodega (ve todas),
  // así que el filtrado para el KPI de Inicio se hace aquí, sin tocar
  // el comportamiento de la pantalla "Mis NPs".
  const esPropia = (np: NP) => np.creado_por_id === perfil.id || np.solicitante_email === perfil.email
  const npsPropias = nps.filter(esPropia)
  const npsParaKpi = (rol === 'solicitante' || rol === 'bodega') ? npsPropias : nps

  const npsPendientes = npsParaKpi.filter(np => np.estado === 'pendiente')
  const ocsEnAprobacion = ocs.filter(oc => oc.estado_oc === 'en_aprobacion_gerencia' || oc.estado_oc === 'en_aprobacion_compras')
  const ocasVigentes = ocas.filter(oca => oca.estado === 'vigente')
  const ocasConAlerta = ocas.filter(oca => oca.alerta_presupuesto !== null || oca.alerta_vigencia)

  const vistas: VistaGuardada[] = vistasVisibles({ id: perfil.id, rol: rol as Rol })
  const conteosVistas = {
    npsPendientes: npsPendientes.length,
    npsVencidasSla,
    ocsEnAprobacionGerencia: ocs.filter(oc => oc.estado_oc === 'en_aprobacion_gerencia').length,
  }

  // Spec CA-04/CA-05 — "Pendientes de mi aprobación"
  let pendientes: PendienteAprobacionItem[] = []
  if (rol === 'coordinador') {
    pendientes = [
      ...pendientesParaCoordinador(nps),
      ...releases.map(r => ({ tipo: 'oca' as const, numero: r.numero_release, href: `/compras/ocas/${r.oca_id}` })),
    ]
  } else if (rol === 'gerencia') {
    pendientes = pendientesParaGerencia(ocs, ocas)
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inicio</h1>
          <p className="text-sm text-slate-500">Hola, {perfil.nombre}</p>
        </div>

        {/* CA-02/CA-03: KPIs — alcance según rol */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-slate-500">{rol === 'solicitante' || rol === 'bodega' ? 'Mis NPs pendientes' : 'NPs pendientes'}</p>
              <p className="text-2xl font-bold text-slate-800">{npsPendientes.length}</p>
            </CardContent>
          </Card>
          {ROLES_CON_OCS.includes(rol) && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">OCs en aprobación</p>
                <p className="text-2xl font-bold text-slate-800">{ocsEnAprobacion.length}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-slate-500">OCAs vigentes</p>
              <p className="text-2xl font-bold text-slate-800">{ocasVigentes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-slate-500">OCAs con alertas</p>
              <p className="text-2xl font-bold text-amber-600">{ocasConAlerta.length}</p>
            </CardContent>
          </Card>
          {ROLES_CON_RELEASES.includes(rol) && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">Releases pendientes</p>
                <p className="text-2xl font-bold text-slate-800">{releases.length}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* CA-04/CA-05: Pendientes de mi aprobación (coordinador/gerencia) */}
        {(rol === 'coordinador' || rol === 'gerencia') && (
          <Card>
            <CardHeader><CardTitle className="text-base">Pendientes de mi aprobación</CardTitle></CardHeader>
            <CardContent>
              {pendientes.length === 0 ? (
                <p className="text-sm text-slate-400">No tienes nada pendiente de aprobación.</p>
              ) : (
                <ul className="space-y-1">
                  {pendientes.map((p, i) => (
                    <li key={`${p.tipo}-${p.numero}-${i}`}>
                      <Link href={p.href} className="text-sm text-teal-700 hover:underline">
                        {p.numero}{p.monto != null ? ` — $${p.monto.toLocaleString()}` : ''}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* CA-02: Vistas guardadas + Actividad reciente */}
        <div className={ROLES_CON_ACTIVIDAD.includes(rol) ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}>
          {vistas.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Vistas guardadas</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {vistas.map(v => {
                  const conteo = contarVista(v.label, conteosVistas)
                  const esVencidaSla = v.label === 'Vencidas por SLA' && (conteo ?? 0) > 0
                  return (
                    <Link key={v.label} href={v.construirHref({ id: perfil.id, rol: rol as Rol })}
                      className="flex items-center justify-between gap-3 text-sm text-teal-700 hover:underline">
                      <span>{v.label}</span>
                      {conteo !== undefined && (
                        <span className={`shrink-0 text-xs font-semibold rounded-full px-2 py-0.5 ${
                          esVencidaSla ? 'bg-red-50 text-red-600' : 'text-slate-500'
                        }`}>{conteo}</span>
                      )}
                    </Link>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {ROLES_CON_ACTIVIDAD.includes(rol) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Actividad reciente</CardTitle></CardHeader>
              <CardContent>
                {auditoria.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin actividad reciente registrada.</p>
                ) : (
                  <ul className="space-y-2">
                    {auditoria.map(a => (
                      <li key={a.id} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-700">{describirAuditoria(a)}</span>
                        <span className="shrink-0 text-xs text-slate-400">{tiempoRelativo(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
