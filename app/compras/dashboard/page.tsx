'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard, BarRow, BarChartV, PieChart, ESTADO_HEX, PRIORIDAD_HEX } from './_shared'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Kpis = {
  total:      number
  pendientes: number
  aprobadas:  number
  rechazadas: number
  devueltas:  number
  convertidas: number
}

type DashData = {
  rol:  string
  scope: 'personal' | 'area' | 'global'
  kpis: Kpis
  porEstado:    { estado: string; count: number }[]
  porArea:      { area: string; count: number }[]
  porPrioridad: { prioridad: string; count: number }[]
  porTipo:      { tipo: string; count: number }[]
  porMes:       { mes: string; count: number }[]
  years:        number[]
  areas:        string[]
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData]           = useState<DashData | null>(null)
  const [error, setError]         = useState('')
  const [cargando, setCargando]   = useState(true)
  const [areaFiltro, setAreaFiltro] = useState('todas')
  const [yearFiltro, setYearFiltro] = useState<number | null>(null)

  function cargar(area: string, year: number | null) {
    setCargando(true)
    const params = new URLSearchParams()
    if (area !== 'todas') params.set('area', area)
    if (year) params.set('year', String(year))
    fetch(`/api/compras/dashboard?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setCargando(false); return }
        setData(d)
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })
  }

  useEffect(() => { cargar(areaFiltro, yearFiltro) }, [areaFiltro, yearFiltro])

  if (error) return (
    <div className="flex items-center justify-center py-24">
      <Card className="max-w-sm w-full">
        <CardContent className="pt-8 pb-8 text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </CardContent>
      </Card>
    </div>
  )

  if (cargando || !data) return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Cargando dashboard...</div>
  )

  const { kpis, porEstado, porArea, porPrioridad, porTipo, porMes, scope, years, areas } = data
  const esGlobal = scope === 'global'
  const maxArea  = Math.max(...porArea.map(r => r.count), 1)
  const maxTipo  = Math.max(...porTipo.map(r => r.count), 1)
  const maxMes   = Math.max(...porMes.map(r => r.count), 1)
  const pctAprob = kpis.total > 0 ? Math.round((kpis.aprobadas  / kpis.total) * 100) : 0
  const pctPend  = kpis.total > 0 ? Math.round((kpis.pendientes / kpis.total) * 100) : 0
  const scopeLabel = scope === 'personal' ? 'Mis NPs' : scope === 'area' ? 'NPs de mi área' : 'Todas las NPs'

  return (
    <div className="bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Dashboard — Notas de Pedido</h1>
            <p className="text-blue-300 text-xs mt-0.5">{scopeLabel} · {kpis.total} NPs en total</p>
          </div>

          {/* Filtros solo para vista global */}
          {esGlobal && (
            <div className="flex flex-wrap items-center gap-3">
              {areas.length > 0 && (
                <select
                  value={areaFiltro}
                  onChange={e => setAreaFiltro(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-teal-500"
                >
                  <option value="todas">Todas las áreas</option>
                  {areas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              <div className="flex gap-1">
                <button
                  onClick={() => setYearFiltro(null)}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${yearFiltro === null ? 'bg-[#1a5252] text-white border-[#1a5252]' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'}`}
                >
                  Todos
                </button>
                {years.map(y => (
                  <button
                    key={y}
                    onClick={() => setYearFiltro(y)}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${yearFiltro === y ? 'bg-[#1a5252] text-white border-[#1a5252]' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── KPIs — CA-01: sin "Total Estimado" ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total NPs"   value={kpis.total.toString()}       colorBar="border-l-slate-400" />
          <KpiCard label="Pendientes"  value={kpis.pendientes.toString()}   sub={`${pctPend}% del total`}  colorBar="border-l-amber-500" />
          <KpiCard label="Aprobadas"   value={kpis.aprobadas.toString()}    sub={`${pctAprob}% del total`} colorBar="border-l-green-600" />
          <KpiCard label="Rechazadas"  value={kpis.rechazadas.toString()}   colorBar="border-l-red-500" />
          <KpiCard label="Devueltas"   value={kpis.devueltas.toString()}    colorBar="border-l-orange-500" />
          <KpiCard label="Convertidas" value={kpis.convertidas.toString()}  colorBar="border-l-blue-600" />
        </div>

        {/* ── Distribución por estado + prioridad ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Distribución por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <PieChart
                data={porEstado.map(({ estado, count }) => ({
                  label: estado,
                  value: count,
                  color: ESTADO_HEX[estado] ?? '#94a3b8',
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Por Prioridad</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartV
                data={porPrioridad.map(({ prioridad, count }) => ({
                  label: prioridad,
                  value: count,
                  color: PRIORIDAD_HEX[prioridad] ?? '#94a3b8',
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── NPs por Área — CA-02: sin "Total Estimado por Área" ── */}
        {porArea.length > 0 && (scope === 'global' || scope === 'area') && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">NPs por Área</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {porArea.map(r => (
                <BarRow key={r.area} label={r.area} value={r.count} max={maxArea} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Por tipo de compra + evolución mensual ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Por Tipo de Compra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {porTipo.length > 0
                ? porTipo.map(r => (
                    <BarRow key={r.tipo} label={r.tipo} value={r.count} max={maxTipo} />
                  ))
                : <p className="text-xs text-slate-400 italic">Sin datos</p>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Evolución Mensual (últimos 12 meses)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {porMes.length > 0
                ? porMes.map(r => (
                    <BarRow key={r.mes} label={r.mes} value={r.count} max={maxMes} />
                  ))
                : <p className="text-xs text-slate-400 italic">Sin datos</p>
              }
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          REQSYS — ARLIFT S.A. · Dashboard de Notas de Pedido
        </p>
      </div>
    </div>
  )
}
