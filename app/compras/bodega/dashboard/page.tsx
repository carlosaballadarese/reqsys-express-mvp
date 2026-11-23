'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { KpiCard, PieChart, BarRow, usd } from '@/app/compras/dashboard/_shared'

type Opcion = { id: string; nombre: string }

type ProductoConAlerta = {
  id: string; codigo: string; descripcion: string; bodega_nombre: string | null
  bajo_minimo: boolean; sobre_maximo: boolean; conteo_vencido: boolean
}

type ResumenDashboardBodega = {
  kpis: {
    total_productos: number
    valor_total_inventario: number
    productos_con_alerta_stock: number
    productos_con_alerta_conteo: number
  }
  porBodega: { bodega_nombre: string; valor_total: number }[]
  porCategoria: { categoria_nombre: string; valor_total: number }[]
  productosConAlerta: ProductoConAlerta[]
}

const PALETA_BODEGA = ['#1a5252', '#c9a840', '#22c55e', '#6366f1', '#ef4444', '#f97316', '#0ea5e9']

// Spec: HU-038 — mismo patrón visual de app/compras/ocas/dashboard/page.tsx (HU-025)
export default function DashboardBodegaPage() {
  const [bodegas, setBodegas] = useState<Opcion[]>([])
  const [categorias, setCategorias] = useState<Opcion[]>([])
  const [areas, setAreas] = useState<Opcion[]>([])
  const [resumen, setResumen] = useState<ResumenDashboardBodega | null>(null)
  const [cargando, setCargando] = useState(true)

  const [filtroBodega, setFiltroBodega] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroArea, setFiltroArea] = useState('')

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas').then(r => r.ok ? r.json() : []).then(data => setBodegas(Array.isArray(data) ? data : []))
    fetch('/api/compras/bodega/categorias').then(r => r.ok ? r.json() : []).then(data => setCategorias(Array.isArray(data) ? data : []))
    fetch('/api/compras/areas?solo_bodega=1').then(r => r.ok ? r.json() : []).then(data => setAreas(Array.isArray(data) ? data : []))
  }, [])

  function cargar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroBodega) params.set('bodega_id', filtroBodega)
    if (filtroCategoria) params.set('categoria_id', filtroCategoria)
    if (filtroArea) params.set('area_id', filtroArea)
    fetch(`/api/compras/bodega/dashboard?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setResumen(data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [filtroBodega, filtroCategoria, filtroArea]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxCategoria = Math.max(1, ...(resumen?.porCategoria.map(c => c.valor_total) ?? [1]))

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Bodega</h1>
          <p className="text-slate-500 text-sm mt-0.5">Indicadores agregados de inventario, stock y conteo físico</p>
        </div>

        <Card className="overflow-visible">
          <CardContent className="flex flex-wrap gap-4 pt-4">
            <div>
              <Label className="text-xs">Bodega</Label>
              <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Área Técnica</Label>
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {cargando || !resumen ? (
          <div className="text-center py-10 text-slate-400">Cargando...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total de Productos" value={String(resumen.kpis.total_productos)} colorBar="border-l-slate-400" />
              <KpiCard label="Valor Total Inventario" value={usd(resumen.kpis.valor_total_inventario)} colorBar="border-l-teal-600" />
              <KpiCard label="Con Alerta de Stock" value={String(resumen.kpis.productos_con_alerta_stock)} colorBar="border-l-red-500" />
              <KpiCard label="Conteo Vencido (+1 año)" value={String(resumen.kpis.productos_con_alerta_conteo)} colorBar="border-l-amber-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Valor de Inventario por Bodega</CardTitle></CardHeader>
                <CardContent>
                  <PieChart data={resumen.porBodega.map((b, i) => ({
                    label: b.bodega_nombre, value: b.valor_total, color: PALETA_BODEGA[i % PALETA_BODEGA.length],
                  }))} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Valor de Inventario por Categoría</CardTitle></CardHeader>
                <CardContent>
                  {resumen.porCategoria.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin datos</p>
                  ) : (
                    resumen.porCategoria
                      .slice()
                      .sort((a, b) => b.valor_total - a.valor_total)
                      .map(c => (
                        <BarRow key={c.categoria_nombre} label={c.categoria_nombre} value={c.valor_total} max={maxCategoria} valueLabel={usd(c.valor_total)} />
                      ))
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm text-slate-600">Productos con Alertas Activas</CardTitle></CardHeader>
              <CardContent>
                {resumen.productosConAlerta.length === 0 ? (
                  <p className="text-sm text-slate-400">Ningún producto con alertas activas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-slate-500 text-xs uppercase">
                          <th className="text-left py-2 pr-4">Código</th>
                          <th className="text-left py-2 pr-4">Descripción</th>
                          <th className="text-left py-2 pr-4">Bodega</th>
                          <th className="text-left py-2">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumen.productosConAlerta.map(p => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <Link href={`/compras/inventario/${p.id}`} className="text-teal-700 hover:underline">{p.codigo}</Link>
                            </td>
                            <td className="py-2 pr-4 text-slate-700">{p.descripcion}</td>
                            <td className="py-2 pr-4 text-slate-700">{p.bodega_nombre ?? '—'}</td>
                            <td className="py-2">
                              {p.bajo_minimo && <span className="text-xs px-2 py-0.5 rounded-full mr-1 bg-red-100 text-red-700">Bajo mínimo</span>}
                              {p.sobre_maximo && <span className="text-xs px-2 py-0.5 rounded-full mr-1 bg-orange-100 text-orange-700">Sobre máximo</span>}
                              {p.conteo_vencido && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Conteo vencido</span>}
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
