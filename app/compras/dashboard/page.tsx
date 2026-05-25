'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Kpis = {
  total: number
  pendientes: number
  aprobadas: number
  rechazadas: number
  devueltas: number
  convertidas: number
  totalEstimado: number
}

type DashData = {
  rol: string
  scope: 'personal' | 'area' | 'global'
  kpis: Kpis
  porEstado:    { estado: string; count: number }[]
  porArea:      { area: string; count: number; total: number }[]
  porPrioridad: { prioridad: string; count: number }[]
  porTipo:      { tipo: string; count: number }[]
  porMes:       { mes: string; count: number; total: number }[]
  years:        number[]
  areas:        string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usd(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const ESTADO_HEX: Record<string, string> = {
  pendiente:  '#f59e0b',
  aprobada:   '#22c55e',
  rechazada:  '#ef4444',
  devuelta:   '#f97316',
  convertida: '#3b82f6',
}

const PRIORIDAD_HEX: Record<string, string> = {
  alta:  '#ef4444',
  media: '#f59e0b',
  baja:  '#22c55e',
}

// ─── Gráfico de pastel SVG ────────────────────────────────────────────────────

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <p className="text-xs text-slate-400 italic">Sin datos</p>

  const R = 70; const cx = 80; const cy = 80

  function polar(angle: number) {
    const rad = (angle * Math.PI) / 180
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) }
  }

  let start = -90
  const slices = data.map(d => {
    const sweep = (d.value / total) * 360
    const s = { ...d, start, sweep }
    start += sweep
    return s
  })

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
        {slices.map(s => {
          if (s.sweep >= 359.9) {
            return <circle key={s.label} cx={cx} cy={cy} r={R} fill={s.color} />
          }
          const p1 = polar(s.start)
          const p2 = polar(s.start + s.sweep)
          const large = s.sweep > 180 ? 1 : 0
          return (
            <path
              key={s.label}
              d={`M${cx},${cy} L${p1.x},${p1.y} A${R},${R} 0 ${large} 1 ${p2.x},${p2.y} Z`}
              fill={s.color}
              stroke="white"
              strokeWidth="2"
            />
          )
        })}
      </svg>
      <div className="space-y-2">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-slate-600 capitalize w-24">{s.label}</span>
            <span className="text-xs font-bold text-slate-800">{s.value}</span>
            <span className="text-xs text-slate-400">({Math.round(s.value / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gráfico de barras vertical SVG ──────────────────────────────────────────

function BarChartV({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (data.length === 0) return <p className="text-xs text-slate-400 italic">Sin datos</p>
  const max = Math.max(...data.map(d => d.value), 1)
  const H = 110; const BW = 56

  return (
    <div className="flex items-end justify-center gap-6 pt-4 pb-2">
      {data.map(d => {
        const barH = Math.max(4, (d.value / max) * H)
        return (
          <div key={d.label} className="flex flex-col items-center gap-1">
            <span className="text-sm font-bold text-slate-700">{d.value}</span>
            <div
              className="rounded-t-md transition-all"
              style={{ width: BW, height: barH, background: d.color }}
            />
            <span className="text-xs text-slate-500 capitalize mt-1">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, colorBar }: { label: string; value: string; sub?: string; colorBar: string }) {
  return (
    <Card className={`border-l-4 ${colorBar}`}>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Barra horizontal ─────────────────────────────────────────────────────────

function BarRow({ label, value, max, badge, badgeClass }: {
  label: string; value: number; max: number; badge?: string; badgeClass?: string
}) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 w-48 shrink-0">
        <span className="text-xs text-slate-600 truncate">{label}</span>
        {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${badgeClass}`}>{badge}</span>}
      </div>
      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
        <div className="h-3 rounded-full bg-[#1a5252] transition-all" style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-8 text-right shrink-0">{value}</span>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData]       = useState<DashData | null>(null)
  const [error, setError]     = useState('')
  const [cargando, setCargando] = useState(true)
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
  const esGlobal  = scope === 'global'
  const maxArea   = Math.max(...porArea.map(r => r.count), 1)
  const maxTipo   = Math.max(...porTipo.map(r => r.count), 1)
  const maxMes    = Math.max(...porMes.map(r => r.count), 1)
  const pctAprob  = kpis.total > 0 ? Math.round((kpis.aprobadas / kpis.total) * 100) : 0
  const pctPend   = kpis.total > 0 ? Math.round((kpis.pendientes / kpis.total) * 100) : 0

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

        {/* ── KPIs principales ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <KpiCard label="Total NPs"      value={kpis.total.toString()}       colorBar="border-l-slate-400" />
          <KpiCard label="Pendientes"     value={kpis.pendientes.toString()}   sub={`${pctPend}% del total`}  colorBar="border-l-amber-500" />
          <KpiCard label="Aprobadas"      value={kpis.aprobadas.toString()}    sub={`${pctAprob}% del total`} colorBar="border-l-green-600" />
          <KpiCard label="Rechazadas"     value={kpis.rechazadas.toString()}   colorBar="border-l-red-500" />
          <KpiCard label="Devueltas"      value={kpis.devueltas.toString()}    colorBar="border-l-orange-500" />
          <KpiCard label="Convertidas"    value={kpis.convertidas.toString()}  colorBar="border-l-blue-600" />
          <KpiCard label="Total Estimado" value={usd(kpis.totalEstimado)}      colorBar="border-l-[#1a5252]" />
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

        {/* ── Por área (solo global y area) ── */}
        {porArea.length > 0 && (scope === 'global' || scope === 'area') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-700">NPs por Área</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5">
                {porArea.map(r => (
                  <BarRow
                    key={r.area}
                    label={r.area}
                    value={r.count}
                    max={maxArea}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-700">Total Estimado por Área</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-slate-500 uppercase">
                      <th className="text-left py-2">Área</th>
                      <th className="text-right py-2">NPs</th>
                      <th className="text-right py-2">Total Estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porArea.map(r => (
                      <tr key={r.area} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-1.5 text-slate-700 text-xs">{r.area}</td>
                        <td className="py-1.5 text-right text-slate-600 text-xs">{r.count}</td>
                        <td className="py-1.5 text-right font-semibold text-[#1a5252] text-xs">{usd(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
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
                    <BarRow
                      key={r.mes}
                      label={r.mes}
                      value={r.count}
                      max={maxMes}
                    />
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
