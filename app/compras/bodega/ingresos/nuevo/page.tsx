'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { ComboConAlta } from '@/components/ComboConAlta'
import { ProductoSearch } from '@/components/ProductoSearch'

type Bodega = { id: string; nombre: string }
type Linea = { producto_id: string; codigo: string; descripcion: string; cantidad: number; costo_unitario: number }
type Prestamo = { id: string; numero: string }

// Spec: HU-029 CA-01 — creación manual de Documento de Ingreso tipo
// Devolución/Reconteo, sin OC de origen.
export default function NuevoIngresoManualPage() {
  const router = useRouter()
  const [tipoMovimiento, setTipoMovimiento] = useState<'devolucion' | 'reconteo'>('devolucion')
  const [bodegaId, setBodegaId] = useState('')
  const [egresoPrestamoId, setEgresoPrestamoId] = useState('')
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [prestamosPendientes, setPrestamosPendientes] = useState<Prestamo[]>([])
  const [lineas, setLineas] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0, costo_unitario: 0 }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
    // Spec: HU-030 CA-05 — Préstamos pendientes, para seleccionar cuál cierra esta Devolución.
    fetch('/api/compras/bodega/egresos/prestamos-pendientes').then((r) => r.json()).then((d) => setPrestamosPendientes(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string | number) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, { producto_id: '', codigo: '', descripcion: '', cantidad: 0, costo_unitario: 0 }])
  }

  function eliminarLinea(idx: number) {
    setLineas((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleCrear() {
    if (lineas.some((l) => !l.producto_id)) {
      toast.error('Toda línea requiere un producto vinculado')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/compras/bodega/ingresos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_movimiento: tipoMovimiento,
          bodega_id: bodegaId || null,
          lineas: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, costo_unitario: l.costo_unitario })),
          egreso_prestamo_id: tipoMovimiento === 'devolucion' ? (egresoPrestamoId || null) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al crear el documento'); return }
      toast.success(`Documento de Ingreso ${data.numero} creado`)
      router.push(`/compras/bodega/ingresos/${data.documento_id}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Nuevo Ingreso Manual (Devolución / Reconteo)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de movimiento</Label>
              <select
                className="border rounded px-2 py-1 text-sm w-full h-9"
                value={tipoMovimiento}
                onChange={(e) => setTipoMovimiento(e.target.value as 'devolucion' | 'reconteo')}
              >
                <option value="devolucion">Devolución</option>
                <option value="reconteo">Reconteo</option>
              </select>
            </div>
            <ComboConAlta
              label="Bodega"
              value={bodegaId}
              onChange={setBodegaId}
              opciones={bodegas}
              onCreado={(nuevo) => setBodegas((prev) => [...prev, nuevo])}
              crearEndpoint="/api/compras/bodega/bodegas"
              construirBody={(nombre, extra) => ({ nombre, codigo: extra.codigo, referencia: extra.referencia || null })}
              placeholderOpcionVacia="— sin especificar —"
              camposExtra={[{ key: 'codigo', label: 'Código', requerido: true }, { key: 'referencia', label: 'Referencia (opcional)' }]}
            />
          </div>

          {tipoMovimiento === 'devolucion' && (
            <div>
              <Label>Préstamo que cierra esta devolución (opcional)</Label>
              <select className="border rounded px-2 py-1 text-sm w-full h-9" value={egresoPrestamoId} onChange={(e) => setEgresoPrestamoId(e.target.value)}>
                <option value="">— sin especificar —</option>
                {prestamosPendientes.map((p) => <option key={p.id} value={p.id}>{p.numero}</option>)}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Líneas</Label>
              <Button size="sm" onClick={agregarLinea}>+ Agregar línea</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Producto</th>
                    <th className="p-2">Cantidad</th>
                    <th className="p-2">Costo Unitario</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2 min-w-[260px]">
                        <ProductoSearch
                          value={l.codigo}
                          onChange={(val) => { actualizarLinea(idx, 'codigo', val); actualizarLinea(idx, 'producto_id', '') }}
                          onSelect={(item) => {
                            actualizarLinea(idx, 'producto_id', item.id)
                            actualizarLinea(idx, 'codigo', item.codigo)
                            actualizarLinea(idx, 'descripcion', item.descripcion)
                          }}
                        />
                        {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                      </td>
                      <td className="p-2 w-24">
                        <Input type="number" value={l.cantidad} onChange={(e) => actualizarLinea(idx, 'cantidad', Number(e.target.value))} />
                      </td>
                      <td className="p-2 w-28">
                        <Input type="number" value={l.costo_unitario} onChange={(e) => actualizarLinea(idx, 'costo_unitario', Number(e.target.value))} />
                      </td>
                      <td className="p-2">
                        {lineas.length > 1 && (
                          <button onClick={() => eliminarLinea(idx)} className="text-red-600 text-xs hover:underline">Eliminar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button onClick={handleCrear} disabled={guardando}>
            {guardando ? 'Creando...' : 'Crear Documento de Ingreso'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
