'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Movimiento = {
  id: string
  producto_id: string
  producto_codigo: string | null
  producto_descripcion: string | null
  bodega_id: string | null
  bodega_nombre: string | null
  direccion: string
  tipo: string
  cantidad: number
  costo_unitario: number
  saldo_resultante: number
  costo_promedio_resultante: number
  fecha: string
}

type Bodega = { id: string; nombre: string }

const TIPO_LABEL: Record<string, string> = {
  compra: 'Compra', devolucion: 'Devolución', field_build: 'Field Build', reconteo: 'Reconteo',
  venta: 'Venta', prestamo: 'Préstamo', gasto: 'Gasto',
}

// Spec: HU-028 CA-08 — Kardex por producto, con filtros.
export default function KardexPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtros, setFiltros] = useState({ producto_codigo: '', bodega_id: '', tipo: '', desde: '', hasta: '' })

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1')
      .then((r) => r.json())
      .then((data) => setBodegas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  function buscar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtros.bodega_id) params.set('bodega_id', filtros.bodega_id)
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)

    fetch(`/api/compras/bodega/kardex?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: Movimiento[] = Array.isArray(data) ? data : []
        const filtradas = filtros.producto_codigo
          ? rows.filter((r) => r.producto_codigo?.toLowerCase().includes(filtros.producto_codigo.toLowerCase()))
          : rows
        setMovimientos(filtradas)
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  useEffect(() => { buscar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Kardex por Producto</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>Código de producto</Label>
              <Input value={filtros.producto_codigo} onChange={(e) => setFiltros((f) => ({ ...f, producto_codigo: e.target.value }))} />
            </div>
            <div>
              <Label>Bodega</Label>
              <select className="border rounded px-2 py-1 text-sm w-full h-9" value={filtros.bodega_id} onChange={(e) => setFiltros((f) => ({ ...f, bodega_id: e.target.value }))}>
                <option value="">Todas</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label>Tipo de movimiento</Label>
              <select className="border rounded px-2 py-1 text-sm w-full h-9" value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="">Todos</option>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label>Desde</Label>
              <Input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
            </div>
          </div>
          <Button className="mt-3" size="sm" onClick={buscar}>Buscar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : movimientos.length === 0 ? (
            <p className="text-sm text-gray-500">No hay movimientos con estos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Producto</th>
                    <th className="p-2">Bodega</th>
                    <th className="p-2">Dirección</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Cantidad</th>
                    <th className="p-2">Costo Unit.</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Costo Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{new Date(m.fecha).toLocaleString()}</td>
                      <td className="p-2">{m.producto_codigo} — {m.producto_descripcion}</td>
                      <td className="p-2">{m.bodega_nombre ?? '—'}</td>
                      <td className="p-2">{m.direccion === 'entrada' ? '⬆ Entrada' : '⬇ Salida'}</td>
                      <td className="p-2">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                      <td className="p-2">{m.cantidad}</td>
                      <td className="p-2">${Number(m.costo_unitario).toFixed(2)}</td>
                      <td className="p-2">{m.saldo_resultante}</td>
                      <td className="p-2">${Number(m.costo_promedio_resultante).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
