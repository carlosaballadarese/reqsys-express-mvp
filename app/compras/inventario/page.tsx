'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { calcularAlertaStock, calcularAlertaConteo } from '@/lib/bodega-alertas'

type Item = {
  id: string
  codigo: string
  descripcion: string
  area: string | null
  categoria: string | null
  saldo_existencias: number
  costo_unitario: number
  locacion: string | null
  marca: string | null
  // Spec: HU-033 CA-01 — ya devueltos por el GET desde HU-027.
  stock_minimo: number | null
  stock_maximo: number | null
  // Spec: HU-034 CA-04 — ya devuelto por el GET desde HU-027.
  ultimo_conteo_fecha: string | null
  // Spec: HU-041 CA-12 — el listado administrativo muestra ambos estados.
  activo: boolean
}

const SEMAFORO_LABEL: Record<string, string> = {
  verde: 'Conteo reciente', amarillo: 'Conteo hace 9m-1a', rojo: 'Conteo hace +1 año', sin_conteo: 'Sin conteo registrado',
}
const SEMAFORO_COLOR: Record<string, string> = {
  verde: 'bg-green-100 text-green-700',
  amarillo: 'bg-amber-100 text-amber-700',
  rojo: 'bg-red-100 text-red-700',
  sin_conteo: 'bg-gray-100 text-gray-500',
}

export default function InventarioPage() {
  const [items, setItems]         = useState<Item[]>([])
  const [cargando, setCargando]   = useState(true)
  const [q, setQ]                 = useState('')
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (q.trim())    params.set('q', q.trim())
    if (categoria)   params.set('categoria', categoria)

    fetch(`/api/compras/inventario?${params}`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : []
        setItems(lista)
        // Extraer categorías únicas para el filtro
        const cats = [...new Set(lista.map((i: Item) => i.categoria).filter(Boolean))] as string[]
        if (cats.length > 0) setCategorias(prev => [...new Set([...prev, ...cats])])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [q, categoria])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-lg font-bold">Inventario</h1>
          <div className="flex flex-wrap gap-2">
            <a href="/api/exportar/inventario" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Excel</Button>
            </a>
            {/* Spec: HU-041 CA-11 — reemplaza al importador viejo (xlsx,
                escribía saldo/costo sin Kardex). Ver /compras/bodega/reemplazo-inventario. */}
            <Link href="/compras/bodega/reemplazo-inventario">
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">↑ Reemplazo Total desde Archivo</Button>
            </Link>
            <Link href="/compras/inventario/nuevo">
              <Button className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">+ Nuevo Ítem</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Buscar código, descripción o marca..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div /> {/* spacer */}
              <Button onClick={cargar} className="h-9 btn-primary">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${items.length} ítems`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay ítems con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Código</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-left py-3 pr-4">Categoría</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-left py-3 pr-4">Marca</th>
                      <th className="text-right py-3 pr-4">Stock</th>
                      <th className="text-right py-3 pr-4">Costo Unit.</th>
                      <th className="text-left py-3 pr-4">Locación</th>
                      <th className="text-left py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-slate-600">{item.codigo}</td>
                        <td className="py-3 pr-4 font-medium">
                          {item.descripcion}
                          {!item.activo && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">Inactivo</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.categoria ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.area ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.marca ?? '—'}</td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`font-medium ${Number(item.saldo_existencias) > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                            {Number(item.saldo_existencias).toFixed(0)}
                          </span>
                          {(() => {
                            const alerta = calcularAlertaStock(Number(item.saldo_existencias), item.stock_minimo, item.stock_maximo)
                            if (alerta.bajoMinimo) return <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">Bajo mínimo</span>
                            if (alerta.sobreMaximo) return <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Sobre máximo</span>
                            return null
                          })()}
                          {(() => {
                            const semaforo = calcularAlertaConteo(item.ultimo_conteo_fecha)
                            return (
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${SEMAFORO_COLOR[semaforo]}`} title={SEMAFORO_LABEL[semaforo]}>
                                ●
                              </span>
                            )
                          })()}
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-600">
                          {Number(item.costo_unitario) > 0 ? `$${Number(item.costo_unitario).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.locacion ?? '—'}</td>
                        <td className="py-3">
                          <Link href={`/compras/inventario/${item.id}`} className="text-xs text-blue-600 hover:underline">
                            Editar
                          </Link>
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
