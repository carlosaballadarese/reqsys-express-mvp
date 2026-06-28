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

type OcCancelada = {
  id:                 string
  numero_oc:          string
  numero_np:          string | null
  nota_pedido_id:     string | null
  area:               string
  proveedor:          string
  created_at:         string
  valor_a_pagar:      number
  motivo_cancelacion: string | null
}

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
  porEstado: { estado: string; count: number; valor: number }[]
  porArea:   { area: string; count: number; valor: number }[]
  porMes:    { mes: string; valor: number }[]
  years:     number[]
  areas:     string[]
}

// ─── Constantes de leyenda ────────────────────────────────────────────────────

const FILTROS_GASTO = [
  { key: 'activas',       label: 'Activas',       desc: 'En proceso, en aprobación y aprobadas — todo lo que no fue rechazado ni cancelado' },
  { key: 'aprobadas',     label: 'Aprobadas',     desc: 'Solo OCs con pago ya confirmado por el aprobador' },
  { key: 'comprometidas', label: 'Comprometidas', desc: 'Solo OCs pendientes de aprobación (en proceso o en aprobación)' },
] as const

type FiltroGasto = typeof FILTROS_GASTO[number]['key']

const ESTADOS_OC_LEGEND = [
  { estado: 'en_proceso',    color: '#94a3b8', label: 'En Proceso',    desc: 'borrador editable, no enviado a aprobación' },
  { estado: 'en_aprobacion', color: '#3b82f6', label: 'En Aprobación', desc: 'enviado al aprobador, pendiente de decisión' },
  { estado: 'aprobada',      color: '#22c55e', label: 'Aprobada',      desc: 'pago autorizado' },
  { estado: 'rechazada',     color: '#ef4444', label: 'Rechazada',     desc: 'no aprobada por el aprobador' },
  { estado: 'cancelada',     color: '#64748b', label: 'Cancelada',     desc: 'anulada por Compras o Admin' },
]

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

  // Spec CA-02/CA-06: tabs Cobertura NPs / OCs Canceladas
  const [tabCobertura, setTabCobertura]           = useState<'nps' | 'canceladas'>('nps')
  const [canceladas, setCanceladas]               = useState<OcCancelada[]>([])
  const [canceladasLoading, setCanceladasLoading] = useState(false)
  const [canceladasCargadas, setCanceladasCargadas] = useState(false) // flag lazy load
  const [vistaArea, setVistaArea]                 = useState<'cantidad' | 'valor'>('cantidad')
  const [vistaEstado, setVistaEstado]             = useState<'cantidad' | 'valor'>('cantidad')
  const [filtroGasto, setFiltroGasto]             = useState<FiltroGasto>('activas')

  function cargar(area: string, year: number | null, filtro: FiltroGasto) {
    const baseParams = new URLSearchParams()
    if (area !== 'todas') baseParams.set('area', area)
    if (year) baseParams.set('year', String(year))

    const ocsParams = new URLSearchParams(baseParams)
    ocsParams.set('filtro_gasto', filtro)

    setCargando(true)
    fetch(`/api/compras/dashboard/ocs?${ocsParams}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setCargando(false); return }
        setData(d)
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })

    setCoberturaLoading(true)
    fetch(`/api/compras/dashboard/cobertura?${baseParams}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setCoberturas(d.nps ?? []) })
      .catch(() => {})
      .finally(() => setCoberturaLoading(false))
  }

  // Spec CA-06: carga lazy de canceladas — solo al activar tab, re-fetch al cambiar filtros
  function cargarCanceladas(area: string, year: number | null) {
    const params = new URLSearchParams()
    if (area !== 'todas') params.set('area', area)
    if (year) params.set('year', String(year))
    setCanceladasLoading(true)
    fetch(`/api/compras/dashboard/canceladas?${params}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setCanceladas(d) })
      .catch(() => {})
      .finally(() => { setCanceladasLoading(false); setCanceladasCargadas(true) })
  }

  useEffect(() => {
    cargar(areaFiltro, yearFiltro, filtroGasto)
    // Spec CA-08: si el tab activo es canceladas, re-fetch al cambiar filtros globales
    if (tabCobertura === 'canceladas' && canceladasCargadas) {
      cargarCanceladas(areaFiltro, yearFiltro)
    }
  }, [areaFiltro, yearFiltro, filtroGasto])

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
  const buildPieData = (vista: 'cantidad' | 'valor') => {
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
    for (const { estado, count, valor } of porEstado) {
      const label = labelMap[estado] ?? estado
      if (!merged[label]) merged[label] = { value: 0, color: colorMap[label] ?? '#94a3b8' }
      merged[label].value += vista === 'cantidad' ? count : valor
    }
    return Object.entries(merged).map(([label, { value, color }]) => ({
      label, value, color,
      valueLabel: vista === 'valor' ? usd(value) : undefined,
    }))
  }
  const pieData = buildPieData(vistaEstado)

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

        {/* ── Filtro financiero + leyenda de estados ── */}
        <Card className="bg-slate-50/70 border-slate-200">
          <CardContent className="py-4 px-5">
            {/* Selector de filtro */}
            <div className="flex flex-wrap items-start gap-4">
              <div className="shrink-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Vista financiera</p>
                <div className="flex gap-1">
                  {FILTROS_GASTO.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFiltroGasto(f.key)}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                        filtroGasto === f.key
                          ? 'bg-[#1a5252] text-white border-[#1a5252]'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 pt-6 italic">
                {FILTROS_GASTO.find(f => f.key === filtroGasto)?.desc}
              </p>
            </div>

            {/* Leyenda de estados */}
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estados de OC</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {ESTADOS_OC_LEGEND.map(e => (
                  <div key={e.estado} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                    <span className="text-xs font-medium text-slate-700">{e.label}</span>
                    <span className="text-xs text-slate-400">— {e.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Por estado (pie) + Por área ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm text-slate-700">Distribución por Estado</CardTitle>
                <div className="flex gap-1">
                  {(['cantidad', 'valor'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setVistaEstado(v)}
                      className={`px-2.5 py-0.5 text-xs rounded-md border transition-colors ${
                        vistaEstado === v
                          ? 'bg-[#1a5252] text-white border-[#1a5252]'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                      }`}
                    >
                      {v === 'cantidad' ? '# OCs' : '$ Gasto'}
                    </button>
                  ))}
                </div>
              </div>
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

        {/* ── Cobertura de NPs / OCs Canceladas — sección con tabs ── */}
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

          // Spec CA-02: activar tab canceladas con carga lazy
          function activarTabCanceladas() {
            setTabCobertura('canceladas')
            if (!canceladasCargadas) cargarCanceladas(areaFiltro, yearFiltro)
          }

          return (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">

                  {/* Título + subtítulo dinámico por tab */}
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-sm text-slate-700">
                        {tabCobertura === 'nps' ? 'Cobertura de NPs Aprobadas' : 'OCs Canceladas'}
                      </CardTitle>
                      {/* Spec CA-02: tabs de modo */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => setTabCobertura('nps')}
                          className={`px-2.5 py-0.5 text-xs rounded-md border transition-colors ${
                            tabCobertura === 'nps'
                              ? 'bg-[#1a5252] text-white border-[#1a5252]'
                              : 'bg-white text-slate-500 border-slate-300 hover:border-teal-400'
                          }`}
                        >
                          Cobertura NPs
                        </button>
                        <button
                          onClick={activarTabCanceladas}
                          className={`px-2.5 py-0.5 text-xs rounded-md border transition-colors ${
                            tabCobertura === 'canceladas'
                              ? 'bg-slate-600 text-white border-slate-600'
                              : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          OCs Canceladas
                          {kpis.canceladas > 0 && (
                            <span className="ml-1.5 bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full text-xs">
                              {kpis.canceladas}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                    {tabCobertura === 'nps' && !coberturaLoading && coberturas.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="text-red-600 font-medium">{pendientesCount} con saldo pendiente</span>
                        {' · '}
                        <span className="text-green-700 font-medium">{cubiertasCount} cubiertas al 100%</span>
                      </p>
                    )}
                  </div>

                  {/* Spec CA-03: filtros de fila solo en tab Cobertura NPs */}
                  {tabCobertura === 'nps' && (
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
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {/* ── Tab: Cobertura NPs (comportamiento actual) ── */}
                {tabCobertura === 'nps' && (
                  coberturaLoading ? (
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
                                <CoberturaBar pct={np.porcentaje_global} manual={np.completado_manualmente} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* ── Tab: OCs Canceladas — Spec CA-04/CA-05/CA-09 ── */}
                {tabCobertura === 'canceladas' && (
                  canceladasLoading ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">Cargando OCs canceladas...</p>
                  ) : canceladas.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">No hay OCs canceladas en el período seleccionado.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-xs text-slate-500 uppercase">
                            <th className="text-left py-2 pr-3">OC</th>
                            <th className="text-left py-2 pr-3">NP Origen</th>
                            <th className="text-left py-2 pr-3">Área</th>
                            <th className="text-left py-2 pr-3">Proveedor</th>
                            <th className="text-left py-2 pr-3">Fecha OC</th>
                            <th className="text-right py-2 pr-3">Monto</th>
                            <th className="text-left py-2">Motivo cancelación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {canceladas.map(oc => (
                            <tr key={oc.id} className="border-b last:border-0 hover:bg-slate-50">
                              <td className="py-2 pr-3">
                                <a
                                  href={`/compras/ordenes/${oc.id}`}
                                  className="font-mono text-xs text-[#1a5252] font-semibold hover:underline"
                                  onClick={e => { e.stopPropagation() }}
                                >
                                  {oc.numero_oc}
                                </a>
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                {oc.nota_pedido_id ? (
                                  <a
                                    href={`/compras/${oc.nota_pedido_id}`}
                                    className="font-mono text-blue-700 hover:underline"
                                    onClick={e => { e.stopPropagation() }}
                                  >
                                    {oc.numero_np ?? oc.nota_pedido_id.slice(0, 8)}
                                  </a>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-xs text-slate-600">{oc.area}</td>
                              <td className="py-2 pr-3 text-xs text-slate-600 max-w-[140px] truncate">{oc.proveedor}</td>
                              <td className="py-2 pr-3 text-xs text-slate-500">
                                {new Date(oc.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </td>
                              <td className="py-2 pr-3 text-right text-xs font-mono text-slate-700">{usd(oc.valor_a_pagar)}</td>
                              <td className="py-2 text-xs text-slate-500 max-w-[200px] truncate" title={oc.motivo_cancelacion ?? ''}>
                                {oc.motivo_cancelacion ?? <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
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
