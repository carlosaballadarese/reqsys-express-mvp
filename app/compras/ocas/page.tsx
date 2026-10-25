'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Oca = {
  id: string
  numero_oca: string
  proveedor_id: string
  proveedor_nombre: string | null
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  presupuesto_total: number
  consumido: number
  disponible: number
  porcentaje_ejecucion: number
  estado: string
  // Spec: HU-024 CA-01/CA-02
  alerta_presupuesto: '100' | '90' | '80' | null
  alerta_vigencia: boolean
}

const ALERTA_PRESUPUESTO_COLOR: Record<string, string> = {
  '100': 'bg-red-100 text-red-700', '90': 'bg-orange-100 text-orange-700', '80': 'bg-amber-100 text-amber-700',
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_aprobacion: 'En aprobación', vigente: 'Vigente',
  suspendida: 'Suspendida', agotada: 'Agotada', vencida: 'Vencida', cerrada: 'Cerrada',
}
const ESTADO_COLOR: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-700', en_aprobacion: 'bg-amber-100 text-amber-800',
  vigente: 'bg-green-100 text-green-800', suspendida: 'bg-purple-100 text-purple-800',
  agotada: 'bg-red-100 text-red-800', vencida: 'bg-amber-100 text-amber-800',
  cerrada: 'bg-slate-200 text-slate-600',
}
const TIPO_LABEL: Record<string, string> = {
  precio_fijo: 'Precio fijo', precio_variable_tope: 'Precio variable (tope)',
}

function usd(n: number) {
  return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function OcasPage() {
  const [ocas, setOcas]       = useState<Oca[]>([])
  const [cargando, setCargando] = useState(true)
  const [rol, setRol]         = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado]   = useState('')
  const [filtroTipo, setFiltroTipo]       = useState('')

  useEffect(() => {
    fetch('/api/auth/perfil').then(r => r.ok ? r.json() : null).then(p => setRol(p?.rol ?? null))
  }, [])

  function cargar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroEstado) params.set('estado', filtroEstado)
    if (filtroTipo) params.set('tipo', filtroTipo)
    fetch(`/api/compras/ocas?${params.toString()}`)
      .then(r => r.json())
      .then(data => { setOcas(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [filtroEstado, filtroTipo])

  const puedeCrear = rol === 'compras' || rol === 'admin'

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Órdenes de Compra Abierta</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Acuerdos marco con proveedores para bienes o servicios recurrentes
            </p>
          </div>
          {puedeCrear && (
            <Link href="/compras/ocas/nueva">
              <Button className="btn-primary text-sm">+ Nueva OCA</Button>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${ocas.length} OCA(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : ocas.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay OCAs registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">N° OCA</th>
                      <th className="text-left py-3 pr-4">Proveedor</th>
                      <th className="text-left py-3 pr-4">Tipo</th>
                      <th className="text-left py-3 pr-4">Período</th>
                      <th className="text-right py-3 pr-4">Presupuesto</th>
                      <th className="text-right py-3 pr-4">Consumido</th>
                      <th className="text-right py-3 pr-4">Disponible</th>
                      <th className="text-left py-3 pr-4">% Ejec.</th>
                      <th className="text-left py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocas.map(o => (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 pr-4 font-medium text-slate-800">
                          <Link href={`/compras/ocas/${o.id}`} className="text-blue-600 hover:underline">
                            {o.numero_oca}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{o.proveedor_nombre ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-700">{TIPO_LABEL[o.tipo] ?? o.tipo}</td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">{o.fecha_inicio} – {o.fecha_fin}</td>
                        <td className="py-3 pr-4 text-right text-slate-700">{usd(o.presupuesto_total)}</td>
                        <td className="py-3 pr-4 text-right text-slate-700">{usd(o.consumido)}</td>
                        <td className="py-3 pr-4 text-right text-slate-700">{usd(o.disponible)}</td>
                        <td className="py-3 pr-4">
                          <div className="w-20 bg-slate-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-teal-600" style={{ width: `${Math.min(100, o.porcentaje_ejecucion)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{o.porcentaje_ejecucion}%</span>
                        </td>
                        <td className="py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_COLOR[o.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                            {ESTADO_LABEL[o.estado] ?? o.estado}
                          </span>
                          {o.alerta_presupuesto && (
                            <span className={`ml-1 text-xs px-2 py-1 rounded-full ${ALERTA_PRESUPUESTO_COLOR[o.alerta_presupuesto]}`}>
                              {o.alerta_presupuesto}% presupuesto
                            </span>
                          )}
                          {o.alerta_vigencia && (
                            <span className="ml-1 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                              Por vencer
                            </span>
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
      </div>
    </div>
  )
}
