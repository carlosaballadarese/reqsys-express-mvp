'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type InvItem = {
  id: string
  codigo: string
  descripcion: string
  costo_unitario: number
  saldo_existencias: number
  categoria: string
}

type ProductoSearchProps = {
  value: string
  onChange: (val: string) => void
  onSelect: (item: InvItem) => void
}

// Combo con autocompletado real: carga coincidencias de inventario a medida
// que se escribe (mismo patrón ya usado en Nueva NP / OCs — search-interno,
// requiere sesión, incluye precio/stock según rol).
function ProductoSearch({ value, onChange, onSelect }: ProductoSearchProps) {
  const [resultados, setResultados] = useState<InvItem[]>([])
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/compras/inventario/search-interno?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(Array.isArray(data) ? data : [])
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  function handleSelect(item: InvItem) {
    onSelect(item)
    setAbierto(false)
    setResultados([])
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => (resultados.length > 0 || value.length >= 2) && setAbierto(true)}
        placeholder="Código o descripción..."
        className="h-9 text-sm"
      />
      {cargando && (
        <span className="absolute right-2 top-2.5 text-xs text-slate-400">buscando...</span>
      )}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias en inventario</li>
          )}
          {resultados.map(item => (
            <li
              key={item.id}
              onMouseDown={() => handleSelect(item)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-xs text-slate-400 mr-2">{item.codigo}</span>
                <span className="text-slate-800">{item.descripcion}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
  const [filtros, setFiltros] = useState({ producto_id: '', producto_codigo: '', bodega_id: '', tipo: '', desde: '', hasta: '' })

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1')
      .then((r) => r.json())
      .then((data) => setBodegas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  function buscar() {
    setCargando(true)
    const params = new URLSearchParams()
    // Spec: si se seleccionó un producto real del combo, filtrar en el
    // servidor por producto_id (ya soportado por el endpoint) en vez de
    // traer todo el Kardex y filtrar en el cliente.
    if (filtros.producto_id) params.set('producto_id', filtros.producto_id)
    if (filtros.bodega_id) params.set('bodega_id', filtros.bodega_id)
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)

    fetch(`/api/compras/bodega/kardex?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: Movimiento[] = Array.isArray(data) ? data : []
        // Si no se seleccionó un producto del combo pero se escribió texto
        // libre sin elegir sugerencia, se mantiene el filtro por substring
        // como respaldo (no se pierde la búsqueda libre ya existente).
        const filtradas = !filtros.producto_id && filtros.producto_codigo
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
              <ProductoSearch
                value={filtros.producto_codigo}
                onChange={(val) => setFiltros((f) => ({ ...f, producto_codigo: val, producto_id: '' }))}
                onSelect={(item) => setFiltros((f) => ({ ...f, producto_codigo: item.codigo, producto_id: item.id }))}
              />
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
                    <th className="p-2">#</th>
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
                  {/* La API ya devuelve orden cronológico ascendente real
                      (fecha, con desempate explícito para movimientos
                      históricos con la misma fecha) — esta columna solo
                      numera visualmente esa secuencia ya correcta, para que
                      se pueda seguir cómo evoluciona el saldo leyendo de
                      arriba hacia abajo. */}
                  {movimientos.map((m, i) => (
                    <tr key={m.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 text-gray-400">{i + 1}</td>
                      <td className="p-2">{new Date(m.fecha).toLocaleDateString()}</td>
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
