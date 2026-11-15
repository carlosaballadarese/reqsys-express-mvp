'use client'

// Spec: SC-016 — "Agregar líneas de NP" (Mejora 3, función 4 del documento
// fuente). Modal acotado (sin agrupación por NP ni multi-select avanzado de
// SC-013/014, fuera de alcance de esta SC) que reutiliza el endpoint ya
// existente de Líneas Pendientes de OC, pre-filtrado por el proveedor de la
// OC actual (removible — "el filtro se puede quitar", texto literal de la
// spec). Al confirmar, entrega las líneas elegidas ya mapeadas a la forma
// `ItemOC` — el componente padre decide cómo fusionarlas (nunca persiste
// nada por sí mismo).
//
// Nota para SC-017: "Agregar a OC existente" es la misma fusión vista desde
// el lado contrario (elegir la OC destino desde el selector) — reutilizará
// este mismo mapeo LineaPendiente → ItemOC sin backend nuevo.

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type LineaPendiente = {
  item_id: string
  np_numero: string
  linea: number
  descripcion: string
  codigo: string | null
  unidad: string
  cantidad: number
  cantidad_total: number
  precio_unitario: number | null
}

export type ItemAgregado = {
  item_np_id: string
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  justificacion_cantidad?: string
}

export function SelectorLineasNPModal({
  proveedorInicial,
  onClose,
  onAgregar,
}: {
  proveedorInicial: string
  onClose: () => void
  onAgregar: (items: ItemAgregado[]) => void
}) {
  const [proveedorFiltro, setProveedorFiltro] = useState(proveedorInicial)
  const [lineas, setLineas]       = useState<LineaPendiente[]>([])
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [cargando, setCargando]   = useState(true)

  function buscar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (proveedorFiltro.trim()) params.set('proveedores', proveedorFiltro.trim())
    fetch(`/api/compras/nps/lineas-pendientes?${params}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(data => { setLineas(Array.isArray(data.rows) ? data.rows : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { buscar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function confirmar() {
    const items: ItemAgregado[] = lineas
      .filter(l => seleccion.has(l.item_id))
      .map(l => ({
        item_np_id:      l.item_id,
        codigo:          l.codigo,
        descripcion:     l.descripcion,
        unidad:          l.unidad,
        cantidad:        l.cantidad,
        precio_unitario: l.precio_unitario ?? 0,
        // Spec: SC-012 — justificación requerida por HU-003 cuando la cantidad
        // agregada (el saldo disponible) difiere del total original de la línea.
        ...(l.cantidad_total > l.cantidad
          ? { justificacion_cantidad: `Saldo disponible tras cobertura parcial previa (${l.cantidad} de ${l.cantidad_total})` }
          : {}),
      }))
    onAgregar(items)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-base">Agregar líneas de NP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600">Filtrar por proveedor sugerido</label>
              <Input
                value={proveedorFiltro}
                onChange={e => setProveedorFiltro(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="(vacío = todos los proveedores)"
              />
            </div>
            <Button variant="outline" onClick={buscar} className="h-9">Buscar</Button>
          </div>

          <div className="overflow-x-auto max-h-80">
            {cargando ? (
              <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
            ) : lineas.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">Sin líneas pendientes con este filtro.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-xs uppercase">
                    <th className="py-2 pr-2"></th>
                    <th className="text-left py-2 pr-3">NP</th>
                    <th className="text-left py-2 pr-3">Línea</th>
                    <th className="text-left py-2 pr-3">Descripción</th>
                    <th className="text-right py-2 pr-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <tr key={l.item_id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => toggle(l.item_id)}>
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={seleccion.has(l.item_id)} onChange={() => toggle(l.item_id)} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{l.np_numero}</td>
                      <td className="py-2 pr-3">{l.linea}</td>
                      <td className="py-2 pr-3">{l.descripcion}</td>
                      <td className="py-2 pr-3 text-right">{l.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-slate-500">{seleccion.size} línea(s) seleccionada(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={confirmar} disabled={seleccion.size === 0} className="btn-primary">Agregar seleccionadas</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
