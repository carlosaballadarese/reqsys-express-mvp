'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type DashboardData = {
  compras: {
    kpis: {
      totalGasto: number
      totalOCs: number
      cerradas: number
      abiertas: number
      pctCerrado: number
      totalPorPagar: number
    }
    porArea: { area: string; total: number }[]
    topProveedores: { proveedor: string; total: number; ocs: number }[]
    porMes: { mes: string; total: number }[]
    porTipo: { tipo: string; total: number }[]
    años: number[]
  }
  inventario: {
    kpis: {
      totalItemsInv: number
      itemsConStock: number
      valorInventario: number
    }
    porArea: { area: string; items: number; valor: number }[]
    porCategoria: { categoria: string; items: number; conStock: number }[]
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usd(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

// ─── Barra CSS horizontal ────────────────────────────────────────────────────

function BarRow({ label, value, max, format }: { label: string; value: number; max: number; format: (n: number) => string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-slate-600 w-44 truncate shrink-0" title={label}>{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
        <div
          className="h-4 rounded-full bg-blue-600 transition-all"
          style={{ width: `${w}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-700 w-24 text-right shrink-0">{format(value)}</span>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'blue' }: { label: string; value: string; sub?: string; color?: string }) {
  const ring: Record<string, string> = {
    blue: 'border-l-blue-600',
    green: 'border-l-green-600',
    amber: 'border-l-amber-500',
    red: 'border-l-red-500',
    slate: 'border-l-slate-500',
  }
  return (
    <Card className={`border-l-4 ${ring[color] ?? ring.blue}`}>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [yearFilter, setYearFilter] = useState<number | null>(null)

  useEffect(() => {
    const url = yearFilter ? `/api/dashboard?year=${yearFilter}` : '/api/dashboard'
    setData(null)
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Error de conexión al cargar el dashboard'))
  }, [yearFilter])

  if (error) {
    return (
      <div className="flex items-center justify-center bg-slate-50 py-24">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <p className="text-red-600 font-medium">{error}</p>
            <p className="text-sm text-slate-500">
              Verifica que las tablas <code>registro_compras</code> e <code>inventario</code> existan en Supabase.
            </p>
            <Link href="/" className="text-blue-600 text-sm hover:underline block">← Volver al inicio</Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center bg-slate-50 py-24">
        <div className="text-slate-400 text-sm">Cargando dashboard...</div>
      </div>
    )
  }

  const { compras, inventario } = data
  const maxArea   = Math.max(...compras.porArea.map(r => r.total), 1)
  const maxProv   = Math.max(...compras.topProveedores.map(r => r.total), 1)
  const maxMes    = Math.max(...compras.porMes.map(r => r.total), 1)
  const maxTipo   = Math.max(...compras.porTipo.map(r => r.total), 1)

  return (
    <div className="bg-slate-50">
      <div className="bg-blue-800 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg font-bold">Dashboard</h1>
          <p className="text-blue-300 text-xs mt-0.5">{compras.kpis.totalOCs.toLocaleString()} órdenes de compra</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── KPIs Compras ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Compras</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Año:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setYearFilter(null)}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${yearFilter === null ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                >
                  Todos
                </button>
                {(data.compras.años ?? []).map(y => (
                  <button
                    key={y}
                    onClick={() => setYearFilter(y)}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${yearFilter === y ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label="Gasto Total" value={usd(compras.kpis.totalGasto)} color="blue" />
            <KpiCard label="Total OCs" value={compras.kpis.totalOCs.toLocaleString()} color="slate" />
            <KpiCard label="Cerradas" value={`${compras.kpis.cerradas.toLocaleString()}`} sub={`${compras.kpis.pctCerrado}% del total`} color="green" />
            <KpiCard label="Abiertas" value={compras.kpis.abiertas.toLocaleString()} color="amber" />
            <KpiCard label="Saldo por Pagar" value={usd(compras.kpis.totalPorPagar)} color="red" />
            <KpiCard label="Tasa de Cierre" value={`${compras.kpis.pctCerrado}%`} color={compras.kpis.pctCerrado >= 80 ? 'green' : 'amber'} />
          </div>
        </section>

        {/* ── Gasto por Área + Top Proveedores ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Gasto por Área</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {compras.porArea.map(r => (
                <BarRow key={r.area} label={r.area} value={r.total} max={maxArea} format={usd} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Top 10 Proveedores por Gasto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {compras.topProveedores.map(r => (
                <BarRow
                  key={r.proveedor}
                  label={r.proveedor}
                  value={r.total}
                  max={maxProv}
                  format={v => `${usd(v)} (${r.ocs} OC)`}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── Gasto por Mes + Por Tipo ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Gasto por Mes de Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {compras.porMes.map(r => (
                <BarRow key={r.mes} label={r.mes} value={r.total} max={maxMes} format={usd} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Top 10 Tipos de Compra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {compras.porTipo.map(r => (
                <BarRow key={r.tipo} label={r.tipo} value={r.total} max={maxTipo} format={usd} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── KPIs Inventario ── */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Inventario</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total SKUs" value={inventario.kpis.totalItemsInv.toLocaleString()} color="slate" />
            <KpiCard
              label="SKUs con Stock"
              value={inventario.kpis.itemsConStock.toLocaleString()}
              sub={`${pct(inventario.kpis.itemsConStock, inventario.kpis.totalItemsInv)}% del catálogo`}
              color="green"
            />
            <KpiCard label="Valor Inventario" value={usd(inventario.kpis.valorInventario)} color="blue" />
          </div>
        </section>

        {/* ── Inventario por Área + Categorías ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Inventario por Área</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500 uppercase">
                    <th className="text-left py-2">Área</th>
                    <th className="text-right py-2">SKUs</th>
                    <th className="text-right py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {inventario.porArea.map(r => (
                    <tr key={r.area} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 text-slate-700">{r.area}</td>
                      <td className="py-2 text-right text-slate-600">{r.items}</td>
                      <td className="py-2 text-right font-medium text-blue-700">{usd(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-700">Inventario por Categoría (Top 12)</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500 uppercase">
                    <th className="text-left py-2">Categoría</th>
                    <th className="text-right py-2">SKUs</th>
                    <th className="text-right py-2">Con Stock</th>
                    <th className="text-right py-2">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {inventario.porCategoria.map(r => (
                    <tr key={r.categoria} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 text-slate-700 truncate max-w-[160px]" title={r.categoria}>{r.categoria}</td>
                      <td className="py-2 text-right text-slate-600">{r.items}</td>
                      <td className="py-2 text-right text-green-700 font-medium">{r.conStock}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs font-medium ${pct(r.conStock, r.items) >= 50 ? 'text-green-600' : 'text-amber-600'}`}>
                          {pct(r.conStock, r.items)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          REQSYS — ARLIFT S.A. · Datos cargados desde Control_Inventario.xlsx y REGISTRO_COMPRAS.xlsx
        </p>
      </div>
    </div>
  )
}
