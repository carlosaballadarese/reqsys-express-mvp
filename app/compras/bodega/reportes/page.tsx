'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Producto = { id: string; codigo: string; descripcion: string }
type Bodega = { id: string; nombre: string }

// Spec: HU-035 — hub de los 5 reportes Excel de Bodega (4 nuevos + Stock
// Bajo Mínimo de HU-033, consolidado aquí en vez de mantener 2 entradas de
// nav para el mismo dominio).
export default function ReportesBodegaPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [productoId, setProductoId] = useState('')
  const [bodegaId, setBodegaId] = useState('')
  const [meses, setMeses] = useState(6)

  useEffect(() => {
    fetch('/api/compras/inventario').then((r) => r.json()).then((d) => setProductos(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/compras/bodega/bodegas?todas=1').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function descargar(url: string) {
    window.location.href = url
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Reportes de Bodega</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Kardex Valorizado (CA-01)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Producto</Label>
            <select className="border rounded px-2 py-1 text-sm w-full h-9" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">— seleccionar —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
            </select>
          </div>
          <Button size="sm" disabled={!productoId} onClick={() => descargar(`/api/compras/bodega/reportes/kardex/excel?producto_id=${productoId}`)}>⬇ Exportar a Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Existencias Valorizadas (CA-02)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Bodega (opcional)</Label>
            <select className="border rounded px-2 py-1 text-sm w-full h-9" value={bodegaId} onChange={(e) => setBodegaId(e.target.value)}>
              <option value="">— todas —</option>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={() => descargar(`/api/compras/bodega/reportes/existencias/excel${bodegaId ? `?bodega_id=${bodegaId}` : ''}`)}>⬇ Exportar a Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos por Filtro (CA-03)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Descarga todos los movimientos de Kardex (rango de fecha/tipo/bodega configurables vía URL).</p>
          <Button size="sm" onClick={() => descargar('/api/compras/bodega/reportes/movimientos/excel')}>⬇ Exportar a Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sin Rotación (CA-04)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Meses sin movimiento</Label>
            <Input type="number" className="max-w-xs" value={meses} onChange={(e) => setMeses(Number(e.target.value))} />
          </div>
          <Button size="sm" onClick={() => descargar(`/api/compras/bodega/reportes/sin-rotacion/excel?meses=${meses}`)}>⬇ Exportar a Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Stock Bajo Mínimo (HU-033)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Productos cuyo saldo actual está por debajo de su Stock Mínimo configurado.</p>
          <Button size="sm" onClick={() => descargar('/api/compras/bodega/reportes/stock-bajo-minimo/excel')}>⬇ Exportar a Excel</Button>
        </CardContent>
      </Card>
    </div>
  )
}
