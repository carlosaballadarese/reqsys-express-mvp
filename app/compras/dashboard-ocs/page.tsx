'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  KpiCard, BarRow, PieChart, CoberturaBar, usd,
  OC_ESTADO_HEX, type NpCobertura,
} from '../dashboard/_shared'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type OcKpis = {
  total:               number
  en_proceso:          number
  en_aprobacion:       number
  aprobadas:           number
  rechazadas:          number
  canceladas:          number
  valor_aprobado:      number
  gasto_comprometido:  number
  gasto_total_emitido: number
}

type DashOCData = {
  rol:       string
  scope:     'personal' | 'global'
  kpis:      OcKpis
  porEstado: { estado: string; count: number }[]
  porArea:   { area: string; count: number; valor: number }[]
  porMes:    { mes: string; valor: number }[]
  years:     number[]
  areas:     string[]
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardOcsPage() {
  const router = useRouter()

  const [data, setData]             = useState<DashOCData | null>(null)
  const [error, setError]           = useState('')
  const [cargando, setCargando]     = useState(true)
  const [areaFiltro, setAreaFiltro] = useState('todas')
  const [yearFiltro, setYearFiltro] = useState<number | null>(null)

  const [coberturas, setCoberturas]               = useState<NpCobertura[]>([])
  const [coberturaLoading, setCoberturaLoading]   = useState(true)
  const [coberturaFiltro, setCoberturaFiltro]     = useState<'todas' | 'parciales' | 'completas'>('todas')
  const [sortDir, setSortDir]                     = useState<'asc' | 'desc'>('asc')
  const [vistaArea, setVistaArea]                 = useState<'cantidad' | 'valor'>('cantidad')

  function cargar(area: string, year: number | null) {
    const params = new URLSearchParams()
    if (area !== 'todas') params.set('area', area)
    if (year) params.set('year', String(year))

    setCargando(true)
    fetch(`/api/compras/dashboard/ocs?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setCargando(false); return }
        setData(d)
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })

    setCoberturaLoading(true)
    fetch(`/api/compras/dashboard/cobertura?${params}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setCoberturas(d.nps ?? []) })
      .catch(() => {})
      .finally(() => setCoberturaLoading(false))
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

  const { kpis, porEstado, porArea, porMes, scope, years, areas } = data
  const esGlobal    = scope === 'global'
  const maxAreaCnt  = Math.max(...porArea.map(r => r.count), 1)
  const maxAreaVal  = Math.max(...porArea.map(r => r.valor), 1)
  const maxMes      = Math.max(...porMes.map(r => r.valor), 1)
  const pctAprob    = kpis.total > 0 ? Math.round((kpis.aprobadas / kpis.total) * 100) : 0
  const scopeLabel  = scope === 'personal' ? 'Mis OCs' : 'Todas las OCs'

  // Pie chart data: merge en_aprobacion_compras + en_aprobacion_gerencia bajo "en aprobación"
  const pieData = (() => {
    const merged: Record<string, { value: number; color: string }> = {}
    const labelMap: Record<string, string> = {
      en_proceso:             'en proceso',
      en_aprobacion_compras:  'en aprobación',
      en_aprobacion_gerencia: 'en aprobación',
      aprobada:               'aprobada',
      rechazada:              'rechazada',
      cancelada:              'cancelada',
    }
    const colorMap: Record<string, string> = {
      'en proceso':    OC_ESTADO_HEX.en_proceso,
      'en aprobación': OC_ESTADO_HEX.en_aprobacion_compras,
      'aprobada':      OC_ESTADO_HEX.aprobada,
      'rechazada':     OC_ESTADO_HEX.rechazada,
      'cancelada':     OC_ESTADO_HEX.cancelada,
    }
    for (const { estado, count } of porEstado) {
      const label = labelMap[estado] ?? estado
      if (!merged[label]) merged[label] = { value: 0, color: colorMap[label] ?? '#94a3b8' }
      merged[label].value += count
    }
    return Object.entries(merged).map(([label, { value, color }]) => ({ label, value, color }))
  })()

  return (
    <div className="bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Dashboard — Órdenes de Compra</h1>
            <p className="text-blue-300 text-xs mt-0.5">{scopeLabel} · {kpis.total} OCs en total</p>
          </div>

          {/* Filtros solo para scope global */}
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

        {/* ── KPIs conteo ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total OCs"     value={kpis.total.toString()}         colorBar="border-l-slate-400" />
          <KpiCard label="En Proceso"    value={kpis.en_proceso.toString()}     colorBar="border-l-slate-400" />
          <KpiCard label="En Aprobación" value={kpis.en_aprobacion.toString()}  colorBar="border-l-blue-500" />
          <KpiCard label="Aprobadas"     value={kpis.aprobadas.toString()}      sub={`${pctAprob}% del total`} colorBar="border-l-green-600" />
          <KpiCard label="Rechazadas"    value={kpis.rechazadas.toString()}     colorBar="border-l-red-500" />
          <KpiCard label="Canceladas"    value={kpis.canceladas.toString()}     colorBar="border-l-slate-500" />
        </div>

        {/* ── KPIs financieros ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label="Gasto Comprometido"  value={usd(kpis.gasto_comprometido)}  sub="OCs activas sin aprobar" colorBar="border-l-amber-500" />
          <KpiCard label="Valor Aprobado"      value={usd(kpis.valor_aprobado)}      sub="OCs en estado aprobada"  colorBar="border-l-[#1a5252]" />
          <KpiCard label="Gasto Total Emitido" value={usd(kpis.gasto_total_emitido)} sub="Excluye rechazadas y canceladas" colorBar="border-l-indigo-500" />
        </div>

        {/* ── Por estado (pie) + Por área ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Distribución por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <PieChart data={pieData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm text-slate-700">OCs por Área</CardTitle>
                <div className="flex gap-1">
                  {(['cantidad', 'valor'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setVistaArea(v)}
                      className={`px-2.5 py-0.5 text-xs rounded-md border transition-colors ${
                        vistaArea === v
                          ? 'bg-[#1a5252] text-white border-[#1a5252]'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                      }`}
                    >
                      {v === 'cantidad' ? '# OCs' : '$ Valor'}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {porArea.length > 0
                ? porArea.map(r => (
                    <BarRow
                      key={r.area}
                      label={r.area}
                      value={vistaArea === 'cantidad' ? r.count : r.valor}
                      max={vistaArea === 'cantidad' ? maxAreaCnt : maxAreaVal}
                      valueLabel={vistaArea === 'valor' ? usd(r.valor) : undefined}
                    />
                  ))
                : <p className="text-xs text-slate-400 italic">Sin datos</p>
              }
            </CardContent>
          </Card>
        </div>

        {/* ── Evolución mensual de gasto ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Gasto Mensual (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {porMes.length > 0
              ? porMes.map(r => (
                  <BarRow key={r.mes} label={r.mes} value={r.valor} max={maxMes} valueLabel={usd(r.valor)} />
                ))
              : <p className="text-xs text-slate-400 italic">Sin datos</p>
            }
          </CardContent>
        </Card>

        {/* ── Cobertura de NPs Aprobadas ── */}
        {(() => {
          const npsFiltradas = coberturas
            .filter(np =>
              coberturaFiltro === 'todas'     ? true :
              coberturaFiltro === 'parciales' ? np.porcentaje_global < 100 :
                                               np.np_cubierta
            )
            .sort((a, b) =>
              sortDir === 'asc'
                ? a.porcentaje_global - b.porcentaje_global
                : b.porcentaje_global - a.porcentaje_global
            )

          const cubiertasCount  = coberturas.filter(np => np.np_cubierta).length
          const pendientesCount = coberturas.filter(np => !np.np_cubierta).length

          return (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm text-slate-700">Cobertura de NPs Aprobadas</CardTitle>
                    {!coberturaLoading && coberturas.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="text-red-600 font-medium">{pendientesCount} con saldo pendiente</span>
                        {' · '}
                        <span className="text-green-700 font-medium">{cubiertasCount} cubiertas al 100%</span>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1 text-xs">
                    {(['todas', 'parciales', 'completas'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setCoberturaFiltro(f)}
                        className={`px-2.5 py-1 rounded-md border transition-colors capitalize ${
                          coberturaFiltro === f
                            ? 'bg-[#1a5252] text-white border-[#1a5252]'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                        }`}
                      >
                        {f === 'parciales' ? '< 100%' : f === 'completas' ? '100%' : 'Todas'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {coberturaLoading ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Cargando cobertura...</p>
                ) : coberturas.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Sin NPs aprobadas o completadas en el período seleccionado.</p>
                ) : npsFiltradas.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Sin NPs que coincidan con el filtro seleccionado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-slate-500 uppercase">
                          <th className="text-left py-2 pr-3">NP</th>
                          <th className="text-left py-2 pr-3">Área</th>
                          <th className="text-left py-2 pr-3">Solicitante</th>
                          <th className="text-center py-2 pr-3">Estado</th>
                          <th className="text-right py-2 pr-3">Solicitado</th>
                          <th className="text-right py-2 pr-3">Comprometido</th>
                          <th
                            className="text-left py-2 pr-2 cursor-pointer select-none hover:text-teal-700 transition-colors"
                            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                          >
                            % Cobertura {sortDir === 'asc' ? '↑' : '↓'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {npsFiltradas.map(np => (
                          <tr
                            key={np.id}
                            className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                            onClick={() => router.push(`/compras/${np.id}`)}
                          >
                            <td className="py-2 pr-3 font-mono text-xs text-[#1a5252] font-semibold">{np.numero}</td>
                            <td className="py-2 pr-3 text-xs text-slate-600">{np.area}</td>
                            <td className="py-2 pr-3 text-xs text-slate-600 max-w-[120px] truncate">{np.solicitante_nombre}</td>
                            <td className="py-2 pr-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                np.estado === 'completada'
                                  ? 'bg-teal-100 text-teal-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {np.estado}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-right text-xs font-mono">{np.total_solicitado}</td>
                            <td className="py-2 pr-3 text-right text-xs font-mono text-blue-700">{np.total_comprometido}</td>
                            <td className="py-2 min-w-[160px]">
                              <CoberturaBar pct={np.porcentaje_global} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })()}

        <p className="text-center text-xs text-slate-400 pb-4">
          REQSYS — ARLIFT S.A. · Dashboard de Órdenes de Compra
        </p>
      </div>
    </div>
  )
}
