'use client'

import { Card, CardContent } from '@/components/ui/card'

// ─── Tipos compartidos ────────────────────────────────────────────────────────

export type NpCobertura = {
  id:                     string
  numero:                 string
  area:                   string
  estado:                 'aprobada' | 'completada'
  prioridad:              string
  solicitante_nombre:     string
  created_at:             string
  porcentaje_global:      number
  np_cubierta:            boolean
  total_solicitado:       number
  total_comprometido:     number
  completado_manualmente: boolean  // Spec CA-06/CA-07
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function usd(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export const ESTADO_HEX: Record<string, string> = {
  pendiente:  '#f59e0b',
  aprobada:   '#22c55e',
  rechazada:  '#ef4444',
  devuelta:   '#f97316',
  convertida: '#3b82f6',
}

export const PRIORIDAD_HEX: Record<string, string> = {
  alta:  '#ef4444',
  media: '#f59e0b',
  baja:  '#22c55e',
}

export const OC_ESTADO_HEX: Record<string, string> = {
  en_proceso:             '#94a3b8',
  en_aprobacion_compras:  '#3b82f6',
  en_aprobacion_gerencia: '#6366f1',
  aprobada:               '#22c55e',
  rechazada:              '#ef4444',
  cancelada:              '#64748b',
}

// ─── Gráfico de pastel SVG ────────────────────────────────────────────────────

export function PieChart({ data }: { data: { label: string; value: number; color: string; valueLabel?: string }[] }) {
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
            <span className="text-xs font-bold text-slate-800">{s.valueLabel ?? s.value}</span>
            <span className="text-xs text-slate-400">({Math.round(s.value / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gráfico de barras vertical SVG ──────────────────────────────────────────

export function BarChartV({ data }: { data: { label: string; value: number; color: string }[] }) {
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

export function KpiCard({ label, value, sub, colorBar }: {
  label: string; value: string; sub?: string; colorBar: string
}) {
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

export function BarRow({ label, value, max, badge, badgeClass, valueLabel }: {
  label: string; value: number; max: number; badge?: string; badgeClass?: string; valueLabel?: string
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
      <span className="text-xs font-semibold text-slate-700 w-16 text-right shrink-0">{valueLabel ?? value}</span>
    </div>
  )
}

// ─── Barra de cobertura coloreada ────────────────────────────────────────────

// Spec CA-07: prop manual opcional — muestra badge "M" para NPs completadas administrativamente
export function CoberturaBar({ pct, manual = false }: { pct: number; manual?: boolean }) {
  const w     = Math.min(pct, 100)
  const color = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const cls   = pct >= 100 ? 'text-green-700' : pct >= 50 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className={`text-xs font-semibold w-14 text-right shrink-0 ${cls}`}>
        {pct.toFixed(0)}%{pct > 100 ? ' ⚠' : ''}
      </span>
      {manual && (
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0"
          title="Completada manualmente por Compras"
        >
          M
        </span>
      )}
    </div>
  )
}
