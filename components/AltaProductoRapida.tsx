'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import type { InvItem } from '@/components/ProductoSearch'

// Spec: HU-037 CA-01/CA-02/CA-03 — alta rápida de un Producto (solo código +
// descripción) desde el selector de Líneas de Ingreso/Egreso/Ensamblaje, sin
// salir de la pantalla. Componente propio en vez de reutilizar
// `ComboConAlta` tal cual: ese componente asume un <select> de opciones ya
// cargadas, mientras que Producto ya tiene su propio patrón de búsqueda
// (`ProductoSearch`, autocompletado sobre ~1.256 productos) que no conviene
// descartar — este componente solo agrega el "+ Nuevo" al lado.
// bodega_id/categoria_id/stock_minimo/stock_maximo quedan sin asignar
// (CA-02) — completables después desde /compras/inventario/[id].
export function AltaProductoRapida({ onCreado }: { onCreado: (item: InvItem) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function crear() {
    const codigoLimpio = codigo.trim()
    const descripcionLimpia = descripcion.trim()
    if (!codigoLimpio || !descripcionLimpia) {
      toast.error('Código y descripción son requeridos')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/compras/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoLimpio, descripcion: descripcionLimpia }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Error al crear el producto')
        return
      }
      onCreado({
        id: data.item.id,
        codigo: data.item.codigo,
        descripcion: data.item.descripcion,
        costo_unitario: Number(data.item.costo_unitario ?? 0),
        saldo_existencias: Number(data.item.saldo_existencias ?? 0),
        categoria: data.item.categoria ?? '',
      })
      setAbierto(false)
      setCodigo('')
      setDescripcion('')
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
      >
        + Nuevo producto
      </button>
    )
  }

  return (
    <div className="border rounded p-2 bg-slate-50 space-y-2 min-w-[220px]">
      <div>
        <Label className="text-xs">Código</Label>
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="h-7 text-xs font-mono" placeholder="AL-I0001" />
      </div>
      <div>
        <Label className="text-xs">Descripción</Label>
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="h-7 text-xs" />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={crear} disabled={guardando} className="h-6 text-xs px-2">
          {guardando ? 'Creando...' : 'Crear'}
        </Button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-slate-500 hover:underline">
          Cancelar
        </button>
      </div>
    </div>
  )
}
