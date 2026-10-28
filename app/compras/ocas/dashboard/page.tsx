'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { KpiCard, PieChart, BarChartV, BarRow, usd } from '@/app/compras/dashboard/_shared'

type Opcion = { id: string; nombre: string }

type ResumenDashboard = {
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

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_aprobacion: 'En aprobación', vigente: 'Vigente',
  suspendida: 'Suspendida', agotada: 'Agotada', vencida: 'Vencida', cerrada: 'Cerrada',
}
const ESTADO_HEX: Record<string, string> = {
  borrador: '#94a3b8', en_aprobacion: '#f59e0b', vigente: '#22c55e',
  suspendida: '#a855f7', agotada: '#ef4444', vencida: '#f97316', cerrada: '#64748b',
}
const ALERTA_PRESUPUESTO_COLOR: Record<string, string> = {
  '100': 'bg-red-100 text-red-700', '90': 'bg-orange-100 text-orange-700', '80': 'bg-amber-100 text-amber-700',
}

// Spec: HU-025 CA-05 — últimos 12 meses de monto de releases aprobados
function fmtMes(mes: string) {
  const [y, m] = mes.split('-')
  return `${m}/${y.slice(2)}`
}

export default function DashboardOcaPage() {
  const [proveedores, setProveedores] = useState<Opcion[]>([])
  const [areas, setAreas] = useState<Opcion[]>([])
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [cargando, setCargando] = useState(true)

  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  useEffect(() => {
    fetch('/api/compras/proveedores?activo=true&limit=200').then(r => r.ok ? r.json() : [])
      .then(data => setProveedores(data.proveedores ?? data ?? []))
    fetch('/api/compras/areas').then(r => r.ok ? r.json() : []).then(data => setAreas(Array.isArray(data) ? data : []))
  }, [])

  function cargar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroEstado) params.set('estado', filtroEstado)
    if (filtroProveedor) params.set('proveedor_id', filtroProveedor)
    if (filtroArea) params.set('area_id', filtroArea)
    if (filtroDesde) params.set('desde', filtroDesde)
    if (filtroHasta) params.set('hasta', filtroHasta)
    fetch(`/api/compras/ocas/dashboard?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setResumen(data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [filtroEstado, filtroProveedor, filtroArea, filtroDesde, filtroHasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxCentroCosto = Math.max(1, ...(resumen?.porCentroCosto.map(c => c.monto_consumido) ?? [1]))

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de OCA</h1>
          <p className="text-slate-500 text-sm mt-0.5">Indicadores de ejecución del módulo de Órdenes de Compra Abierta</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap gap-4 pt-4">
            <div>
              <Label className="text-xs">Estado</Label>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Centro de costo</Label>
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1" />
            </div>
          </CardContent>
        </Card>

        {cargando || !resumen ? (
          <div className="text-center py-10 text-slate-400">Cargando...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="Total de OCAs" value={String(resumen.kpis.total)} colorBar="border-l-slate-400" />
              <KpiCard label="Presupuesto Total" value={usd(resumen.kpis.presupuesto_total)} colorBar="border-l-teal-600" />
              <KpiCard label="Consumido" value={usd(resumen.kpis.consumido_total)} colorBar="border-l-amber-500" />
              <KpiCard label="Disponible" value={usd(resumen.kpis.disponible_total)} colorBar="border-l-green-600" />
              <KpiCard label="% Ejecución Global" value={`${resumen.kpis.porcentaje_ejecucion_global}%`} colorBar="border-l-indigo-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">OCAs por Estado</CardTitle></CardHeader>
                <CardContent>
                  <PieChart data={resumen.porEstado.map(e => ({
                    label: ESTADO_LABEL[e.estado] ?? e.estado, value: e.count, color: ESTADO_HEX[e.estado] ?? '#94a3b8',
                  }))} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Evolución Mensual — Releases Aprobados</CardTitle></CardHeader>
                <CardContent>
                  <BarChartV data={resumen.porMes.map(m => ({ label: fmtMes(m.mes), value: m.monto, color: '#1a5252' }))} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Consumo por Centro de Costo</CardTitle></CardHeader>
              <CardContent>
                {resumen.porCentroCosto.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sin datos</p>
                ) : (
                  resumen.porCentroCosto.map(c => (
                    <BarRow key={c.area_nombre} label={c.area_nombre} value={c.monto_consumido} max={maxCentroCosto} valueLabel={usd(c.monto_consumido)} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-slate-600">OCAs con Alertas Activas</CardTitle>
                  <Link href="/compras/ocas/releases-pendientes" className="text-xs text-teal-700 hover:underline">
                    {`${resumen.kpis.releases_pendientes_con_alerta} release(s) pendiente(s) > 24h →`}
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {resumen.ocasConAlerta.length === 0 ? (
                  <p className="text-sm text-slate-400">Ninguna OCA con alertas activas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-slate-500 text-xs uppercase">
                          <th className="text-left py-2 pr-4">N° OCA</th>
                          <th className="text-left py-2 pr-4">Proveedor</th>
                          <th className="text-left py-2 pr-4">Estado</th>
                          <th className="text-left py-2">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumen.ocasConAlerta.map(o => (
                          <tr key={o.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <Link href={`/compras/ocas/${o.id}`} className="text-teal-700 hover:underline">{o.numero_oca}</Link>
                            </td>
                            <td className="py-2 pr-4 text-slate-700">{o.proveedor_nombre}</td>
                            <td className="py-2 pr-4 text-slate-700">{ESTADO_LABEL[o.estado] ?? o.estado}</td>
                            <td className="py-2">
                              {o.alerta_presupuesto && (
                                <span className={`text-xs px-2 py-0.5 rounded-full mr-1 ${ALERTA_PRESUPUESTO_COLOR[o.alerta_presupuesto]}`}>
                                  {o.alerta_presupuesto}% presupuesto
                                </span>
                              )}
                              {o.alerta_vigencia && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Por vencer</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
