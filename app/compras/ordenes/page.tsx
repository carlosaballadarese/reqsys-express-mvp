'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type OC = {
  id: string
  numero_oc: string
  numero_np: string | null
  proveedor: string
  area: string | null
  tipo_compra: string | null
  valor_total: number
  valor_a_pagar: number
  estado_oc: string
  fecha_oc: string | null
  created_at: string
}

const ESTADO_BADGE: Record<string, string> = {
  en_proceso:               'bg-yellow-100 text-yellow-800',
  en_aprobacion_gerencia:   'bg-purple-100 text-purple-800',
  en_aprobacion_compras:    'bg-blue-100 text-blue-800',
  rechazada:                'bg-red-100 text-red-800',
  aprobada:                 'bg-green-100 text-green-800',
}

const ESTADO_LABEL: Record<string, string> = {
  en_proceso:               'En Proceso',
  en_aprobacion_gerencia:   'Aprobación Gerencia',
  en_aprobacion_compras:    'Aprobación Compras',
  rechazada:                'Rechazada',
  aprobada:                 'Aprobada',
}

const ESTADOS = ['todos', 'en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras', 'rechazada', 'aprobada']

const AREAS = [
  'Operaciones - Bombeo Mecánico', 'Operaciones - Servicio Eléctrico', 'Operaciones - Niveles',
  'Compras', 'QHSE', 'TTHH', 'Finanzas', 'Gerencia', 'Ventas',
]

export default function OrdenesPage() {
  const [ocs, setOcs]           = useState<OC[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ]               = useState('')
  const [estado, setEstado]     = useState('todos')
  const [area, setArea]         = useState('todas')

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (estado !== 'todos') params.set('estado', estado)
    if (area   !== 'todas') params.set('area', area)
    if (q.trim())           params.set('q', q.trim())

    fetch(`/api/compras/ordenes?${params}`)
      .then(r => r.json())
      .then(data => { setOcs(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [estado, area, q])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-800 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Órdenes de Compra</h1>
          </div>
          <Link href="/compras/ordenes/nueva">
            <Button className="bg-white text-blue-800 hover:bg-blue-50 text-sm font-semibold">+ Nueva OC</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Buscar número OC, NP o proveedor..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : ESTADO_LABEL[e] ?? e}</option>
                ))}
              </select>
              <select
                value={area}
                onChange={e => setArea(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas las áreas</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <Button onClick={cargar} className="h-9 bg-blue-700 hover:bg-blue-800">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${ocs.length} órdenes`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : ocs.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay órdenes con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Número OC</th>
                      <th className="text-left py-3 pr-4">NP Origen</th>
                      <th className="text-left py-3 pr-4">Proveedor</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-right py-3 pr-4">Total</th>
                      <th className="text-right py-3 pr-4">A Pagar</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3">Fecha OC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocs.map(oc => (
                      <tr key={oc.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          <Link href={`/compras/ordenes/${oc.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                            {oc.numero_oc}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                          {oc.numero_np
                            ? <span className="text-slate-600">{oc.numero_np}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="py-3 pr-4 font-medium">{oc.proveedor}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{oc.area ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-medium">${Number(oc.valor_total).toFixed(2)}</td>
                        <td className="py-3 pr-4 text-right text-blue-700 font-medium">${Number(oc.valor_a_pagar).toFixed(2)}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[oc.estado_oc] ?? 'bg-slate-100 text-slate-600'}`}>
                            {ESTADO_LABEL[oc.estado_oc] ?? oc.estado_oc}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500 text-xs">
                          {oc.fecha_oc
                            ? new Date(oc.fecha_oc).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
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
