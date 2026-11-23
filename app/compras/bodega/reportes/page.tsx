'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProductoSearch } from '@/components/ProductoSearch'

type Bodega = { id: string; nombre: string }

// Spec: HU-035 — hub de los 5 reportes Excel de Bodega (4 nuevos + Stock
// Bajo Mínimo de HU-033, consolidado aquí en vez de mantener 2 entradas de
// nav para el mismo dominio).
export default function ReportesBodegaPage() {
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [productoId, setProductoId] = useState('')
  const [productoCodigo, setProductoCodigo] = useState('')
  const [bodegaId, setBodegaId] = useState('')
  const [meses, setMeses] = useState(6)

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function descargar(url: string) {
    window.location.href = url
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Reportes de Bodega</h1>

      <Card className="overflow-visible">
        <CardHeader><CardTitle className="text-base">Kardex (CA-01)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Producto (opcional — déjalo vacío para exportar todos)</Label>
            <ProductoSearch
              value={productoCodigo}
              onChange={(val) => { setProductoCodigo(val); setProductoId('') }}
              onSelect={(item) => { setProductoId(item.id); setProductoCodigo(item.codigo) }}
            />
          </div>
          <Button size="sm" onClick={() => descargar(`/api/compras/bodega/reportes/kardex/excel${productoId ? `?producto_id=${productoId}` : ''}`)}>⬇ Exportar a Excel</Button>
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

      <h2 className="text-lg font-semibold text-slate-700 pt-2">Catálogos (HU-040)</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Catálogos de Bodega</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/bodegas/excel')}>⬇ Bodegas</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/categorias/excel')}>⬇ Categorías</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/clientes-finales/excel')}>⬇ Clientes Finales</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/puntos-entrega/excel')}>⬇ Lugar de Entrega</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/tipos-ingreso/excel')}>⬇ Tipos de Ingreso</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/tipos-egreso/excel')}>⬇ Tipos de Egreso</Button>
          <Button size="sm" variant="outline" onClick={() => descargar('/api/compras/bodega/reportes/catalogos/proveedores/excel')}>⬇ Proveedores</Button>
        </CardContent>
      </Card>
    </div>
  )
}
