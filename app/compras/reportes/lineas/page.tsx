'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Area = { id: string; nombre: string }

// Spec: SC-007 — ver documents/requirements/SC-007-.../sdd-design.md
const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', pendiente: 'En aprobación', aprobada: 'Aprobada',
  rechazada: 'Rechazada', devuelta: 'Devuelta', en_gestion: 'En gestión',
  oc_directa: 'OC directa', oc_generada: 'OC generada', oc_en_aprobacion: 'OC en aprobación',
  oc_aprobada: 'OC aprobada', oca_generada: 'OCA generada', oca_oc_generada: 'OC + OCA generadas',
  completada: 'Completada', cancelada: 'Cancelada',
}

export default function ReporteLineasPage() {
  const [areas, setAreas] = useState<Area[]>([])

  useEffect(() => {
    fetch('/api/compras/areas').then(r => r.ok ? r.json() : []).then(data => setAreas(Array.isArray(data) ? data : []))
  }, [])

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [area, setArea] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [estadoNp, setEstadoNp] = useState('')

  function descargar() {
    const params = new URLSearchParams()
    if (fechaDesde) params.set('fecha_desde', fechaDesde)
    if (fechaHasta) params.set('fecha_hasta', fechaHasta)
    if (area) params.set('area', area)
    if (proveedor) params.set('proveedor', proveedor)
    if (estadoNp) params.set('estado_np', estadoNp)
    window.location.href = `/api/compras/reportes/lineas/excel?${params.toString()}`
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Reporte de Líneas NP / OC / OCA</h1>
        <p className="text-sm text-slate-600">
          Una fila por cada línea de Nota de Pedido, con su cobertura real vía Orden de
          Compra y/o OCA (trazabilidad histórica completa, sin filtrar por estado de la
          cobertura).
        </p>

        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs">Fecha NP aprobada — desde</Label>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Fecha NP aprobada — hasta</Label>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Área</Label>
              <select value={area} onChange={e => setArea(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <Input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Sugerido, OC u OCA" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Estado NP</Label>
              <select value={estadoNp} onChange={e => setEstadoNp(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {Object.entries(ESTADO_LABEL).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-5">
              <Button className="btn-primary text-sm" onClick={descargar}>⬇ Exportar a Excel</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
