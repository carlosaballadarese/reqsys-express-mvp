'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductoSearch, type InvItem } from '@/components/ProductoSearch'

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

function Kpi({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className={`rounded-lg p-4 text-white ${color}`}>
      <div className="text-xs opacity-90">{titulo}</div>
      <div className="text-2xl font-bold mt-1">{valor}</div>
    </div>
  )
}

// Spec: HU-028 CA-08 — Kardex por producto, con filtros.
// Decisión del usuario: sin producto seleccionado no se carga ni se muestra
// nada (sin el listado completo del Kardex por defecto) — toda la pantalla
// gira en torno al producto elegido, igual que su propósito ("Kardex de
// Producto"), no un listado general de movimientos.
export default function KardexPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [cargando, setCargando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [productoSel, setProductoSel] = useState<InvItem | null>(null)
  const [filtros, setFiltros] = useState({ producto_id: '', producto_codigo: '', bodega_id: '', tipo: '', desde: '', hasta: '' })

  useEffect(() => {
    // Fix: hallazgo real (2026-11-22) — ?todas=1 es admin/compras-only; el
    // rol 'bodega' (puede visitar esta pantalla, ver proxy.ts) recibía 403
    // y el filtro de Bodega quedaba vacío (mismo patrón ya corregido en
    // los formularios de "Nuevo" Ingreso/Egreso/Ensamblaje).
    fetch('/api/compras/bodega/bodegas')
      .then((r) => r.json())
      .then((data) => setBodegas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  function buscar(productoIdOverride?: string) {
    const productoId = productoIdOverride ?? filtros.producto_id
    if (!productoId) return
    setCargando(true)
    setBuscado(true)
    const params = new URLSearchParams()
    params.set('producto_id', productoId)
    if (filtros.bodega_id) params.set('bodega_id', filtros.bodega_id)
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)

    fetch(`/api/compras/bodega/kardex?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setMovimientos(Array.isArray(data) ? data : [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  function handleSelectProducto(item: InvItem) {
    setProductoSel(item)
    setFiltros((f) => ({ ...f, producto_codigo: item.codigo, producto_id: item.id }))
    setMovimientos([])
    buscar(item.id)
  }

  // Resumen derivado de las filas ya traídas (orden cronológico ascendente
  // real, confirmado por la API) — sin pedir nada nuevo al backend.
  // Spec: a pedido del usuario, se quitó el resumen de cierre al final de la
  // tabla (Stock Inicial/Total Entradas/Total Salidas/Stock Final) — Total
  // Entradas/Salidas eran literalmente los mismos valores ya mostrados en las
  // tarjetas KPI de la cabecera (mismas variables), y Stock Inicial siempre es
  // 0 mientras no haya un filtro de fecha "Desde" activo.
  const totalEntradas = movimientos.filter((m) => m.direccion === 'entrada').reduce((s, m) => s + Number(m.cantidad), 0)
  const totalSalidas = movimientos.filter((m) => m.direccion === 'salida').reduce((s, m) => s + Number(m.cantidad), 0)

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Kardex de Producto</CardTitle></CardHeader>
        <CardContent>
          <Label>Producto</Label>
          <ProductoSearch
            value={filtros.producto_codigo}
            onChange={(val) => {
              setFiltros((f) => ({ ...f, producto_codigo: val, producto_id: '' }))
              setProductoSel(null)
              setMovimientos([])
              setBuscado(false)
            }}
            onSelect={handleSelectProducto}
          />
        </CardContent>
      </Card>

      {!filtros.producto_id ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Busca y selecciona un producto para ver su Kardex.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              <div>
                <div className="font-mono text-xs text-gray-400">{productoSel?.codigo}</div>
                <div className="font-semibold">{productoSel?.descripcion}</div>
                {productoSel?.categoria && <div className="text-xs text-gray-500">{productoSel.categoria}</div>}
              </div>
              <div className="grid grid-cols-3 gap-3 flex-1 min-w-[320px]">
                <Kpi titulo="Stock Actual" valor={`${productoSel?.saldo_existencias ?? 0}`} color="bg-blue-600" />
                <Kpi titulo="Entradas (filtro)" valor={`+${totalEntradas}`} color="bg-green-600" />
                <Kpi titulo="Salidas (filtro)" valor={`-${totalSalidas}`} color="bg-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-visible">
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <Button className="mt-3" size="sm" onClick={() => buscar()}>Actualizar</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              {cargando ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : !buscado ? null : movimientos.length === 0 ? (
                <p className="text-sm text-gray-500">No hay movimientos con estos filtros.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="p-2">#</th>
                          <th className="p-2">Fecha</th>
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
                        {/* La API ya devuelve orden cronológico ascendente
                            real (fecha, con desempate explícito para
                            movimientos históricos con la misma fecha) —
                            esta columna solo numera visualmente esa
                            secuencia ya correcta, para poder seguir cómo
                            evoluciona el saldo leyendo de arriba hacia
                            abajo. */}
                        {movimientos.map((m, i) => (
                          <tr key={m.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-gray-400">{i + 1}</td>
                            <td className="p-2">{new Date(m.fecha).toLocaleDateString()}</td>
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
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
