'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Opcion = { id: string; nombre: string }

// Spec: HU-023 CA-01 a CA-04 — 4 reportes, sin preview en pantalla (Decisión de diseño #2)
export default function ReportesOcaPage() {
  const [proveedores, setProveedores] = useState<Opcion[]>([])
  const [areas, setAreas] = useState<Opcion[]>([])
  const [ocas, setOcas] = useState<{ id: string; numero_oca: string }[]>([])

  useEffect(() => {
    fetch('/api/compras/proveedores?activo=true&limit=200').then(r => r.ok ? r.json() : [])
      .then(data => setProveedores(data.proveedores ?? data ?? []))
    fetch('/api/compras/areas').then(r => r.ok ? r.json() : []).then(data => setAreas(Array.isArray(data) ? data : []))
    fetch('/api/compras/ocas').then(r => r.ok ? r.json() : []).then(data => setOcas(Array.isArray(data) ? data : []))
  }, [])

  // ── Reporte 1: Estado de OCA (CA-01) ──────────────────────────────────────
  const [estEstado, setEstEstado] = useState('')
  const [estProveedor, setEstProveedor] = useState('')
  const [estTipo, setEstTipo] = useState('')
  const [estDesde, setEstDesde] = useState('')
  const [estHasta, setEstHasta] = useState('')

  function descargarEstado() {
    const params = new URLSearchParams()
    if (estEstado) params.set('estado', estEstado)
    if (estProveedor) params.set('proveedor_id', estProveedor)
    if (estTipo) params.set('tipo', estTipo)
    if (estDesde) params.set('desde', estDesde)
    if (estHasta) params.set('hasta', estHasta)
    window.location.href = `/api/compras/ocas/reportes/estado/excel?${params.toString()}`
  }

  // ── Reporte 2: Detalle de releases (CA-02) ────────────────────────────────
  const [relOca, setRelOca] = useState('')
  const [relProveedor, setRelProveedor] = useState('')
  const [relArea, setRelArea] = useState('')
  const [relEstado, setRelEstado] = useState('')
  const [relDesde, setRelDesde] = useState('')
  const [relHasta, setRelHasta] = useState('')

  function descargarReleases() {
    const params = new URLSearchParams()
    if (relOca) params.set('oca_id', relOca)
    if (relProveedor) params.set('proveedor_id', relProveedor)
    if (relArea) params.set('area_id', relArea)
    if (relEstado) params.set('estado', relEstado)
    if (relDesde) params.set('desde', relDesde)
    if (relHasta) params.set('hasta', relHasta)
    window.location.href = `/api/compras/ocas/reportes/releases/excel?${params.toString()}`
  }

  // ── Reporte 3: Consumo por centro de costo (CA-03) ────────────────────────
  const [consOca, setConsOca] = useState('')
  const [consProveedor, setConsProveedor] = useState('')
  const [consDesde, setConsDesde] = useState('')
  const [consHasta, setConsHasta] = useState('')

  function descargarConsumo() {
    const params = new URLSearchParams()
    if (consOca) params.set('oca_id', consOca)
    if (consProveedor) params.set('proveedor_id', consProveedor)
    if (consDesde) params.set('desde', consDesde)
    if (consHasta) params.set('hasta', consHasta)
    window.location.href = `/api/compras/ocas/reportes/consumo-centro-costo/excel?${params.toString()}`
  }

  // ── Reporte 4: Histórico de enmiendas (CA-04) ─────────────────────────────
  const [enmOca, setEnmOca] = useState('')
  const [enmTipo, setEnmTipo] = useState('')
  const [enmEstado, setEnmEstado] = useState('')

  function descargarEnmiendas() {
    const params = new URLSearchParams()
    if (enmOca) params.set('oca_id', enmOca)
    if (enmTipo) params.set('enmienda_tipo', enmTipo)
    if (enmEstado) params.set('estado', enmEstado)
    window.location.href = `/api/compras/ocas/reportes/enmiendas/excel?${params.toString()}`
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Reportes de Ejecución de OCA</h1>

        <Card>
          <CardHeader><CardTitle className="text-base">Estado de OCA</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs">Estado</Label>
              <select value={estEstado} onChange={e => setEstEstado(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="en_aprobacion">En aprobación</option>
                <option value="vigente">Vigente</option>
                <option value="suspendida">Suspendida</option>
                <option value="agotada">Agotada</option>
                <option value="vencida">Vencida</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <select value={estProveedor} onChange={e => setEstProveedor(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select value={estTipo} onChange={e => setEstTipo(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                <option value="precio_fijo">Precio fijo</option>
                <option value="precio_variable_tope">Precio variable (tope)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={estDesde} onChange={e => setEstDesde(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={estHasta} onChange={e => setEstHasta(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div className="sm:col-span-5">
              <Button className="btn-primary text-sm" onClick={descargarEstado}>⬇ Descargar Excel</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Detalle de Releases</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs">OCA</Label>
              <select value={relOca} onChange={e => setRelOca(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {ocas.map(o => <option key={o.id} value={o.id}>{o.numero_oca}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <select value={relProveedor} onChange={e => setRelProveedor(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Centro de costo</Label>
              <select value={relArea} onChange={e => setRelArea(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Estado del release</Label>
              <select value={relEstado} onChange={e => setRelEstado(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                <option value="pendiente_aprobacion">Pendiente de aprobación</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
                <option value="anulado">Anulado</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={relDesde} onChange={e => setRelDesde(e.target.value)} className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={relHasta} onChange={e => setRelHasta(e.target.value)} className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div className="sm:col-span-5">
              <Button className="btn-primary text-sm" onClick={descargarReleases}>⬇ Descargar Excel</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Consumo por Centro de Costo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">OCA</Label>
              <select value={consOca} onChange={e => setConsOca(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {ocas.map(o => <option key={o.id} value={o.id}>{o.numero_oca}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <select value={consProveedor} onChange={e => setConsProveedor(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={consDesde} onChange={e => setConsDesde(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={consHasta} onChange={e => setConsHasta(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div className="sm:col-span-4">
              <Button className="btn-primary text-sm" onClick={descargarConsumo}>⬇ Descargar Excel</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Histórico de Enmiendas</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">OCA</Label>
              <select value={enmOca} onChange={e => setEnmOca(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {ocas.map(o => <option key={o.id} value={o.id}>{o.numero_oca}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select value={enmTipo} onChange={e => setEnmTipo(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                <option value="incremento_presupuesto">Incremento de presupuesto</option>
                <option value="extension_plazo">Extensión de plazo</option>
                <option value="modificacion_precios">Modificación de lista de precios</option>
                <option value="cambio_modalidad_facturacion">Cambio de modalidad de facturación</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <select value={enmEstado} onChange={e => setEnmEstado(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="aprobada">Aprobada</option>
                <option value="rechazada">Rechazada</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <Button className="btn-primary text-sm" onClick={descargarEnmiendas}>⬇ Descargar Excel</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
