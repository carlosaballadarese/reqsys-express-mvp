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
type ClienteFinal = { id: string; nombre: string }
type PuntoEntrega = { id: string; nombre: string }
type Linea = { producto_id: string; codigo: string; descripcion: string; cantidad: number }

// Spec: HU-030 CA-01 — creación de Documento de Egreso (Venta/Gasto/Préstamo/Reconteo).
export default function NuevoEgresoPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<'venta' | 'gasto' | 'prestamo' | 'reconteo'>('venta')
  const [bodegaId, setBodegaId] = useState('')
  const [clienteFinalId, setClienteFinalId] = useState('')
  const [puntoEntregaId, setPuntoEntregaId] = useState('')
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [clientes, setClientes] = useState<ClienteFinal[]>([])
  const [puntosEntrega, setPuntosEntrega] = useState<PuntoEntrega[]>([])
  const [lineas, setLineas] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])
  const [guardando, setGuardando] = useState(false)

  const permiteDestino = tipo === 'venta' || tipo === 'gasto'

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/compras/bodega/clientes-finales?todas=1').then((r) => r.json()).then((d) => setClientes(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/compras/bodega/puntos-entrega?todas=1').then((r) => r.json()).then((d) => setPuntosEntrega(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string | number) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }
  function agregarLinea() { setLineas((prev) => [...prev, { producto_id: '', codigo: '', descripcion: '', cantidad: 0 }]) }
  function eliminarLinea(idx: number) { setLineas((prev) => prev.filter((_, i) => i !== idx)) }

  async function handleCrear() {
    if (!bodegaId) { toast.error('Selecciona la Bodega de origen'); return }
    if (lineas.some((l) => !l.producto_id)) { toast.error('Toda línea requiere un producto vinculado'); return }
    setGuardando(true)
    try {
      const res = await fetch('/api/compras/bodega/egresos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, bodega_id: bodegaId,
          cliente_final_id: permiteDestino ? (clienteFinalId || null) : null,
          punto_entrega_id: permiteDestino ? (puntoEntregaId || null) : null,
          lineas: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al crear el documento'); return }
      toast.success(`Documento de Egreso ${data.numero} creado`)
      router.push(`/compras/bodega/egresos/${data.documento_id}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Nuevo Documento de Egreso</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <select className="border rounded px-2 py-1 text-sm w-full h-9" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="venta">Venta</option>
                <option value="gasto">Gasto</option>
                <option value="prestamo">Préstamo</option>
                <option value="reconteo">Reconteo</option>
              </select>
            </div>
            <ComboConAlta
              label="Bodega de origen"
              value={bodegaId}
              onChange={setBodegaId}
              opciones={bodegas}
              onCreado={(nuevo) => setBodegas((prev) => [...prev, nuevo])}
              crearEndpoint="/api/compras/bodega/bodegas"
              construirBody={(nombre, extra) => ({ nombre, codigo: extra.codigo, referencia: extra.referencia || null })}
              camposExtra={[{ key: 'codigo', label: 'Código', requerido: true }, { key: 'referencia', label: 'Referencia (opcional)' }]}
            />
          </div>

          {permiteDestino && (
            <div className="grid grid-cols-2 gap-4">
              <ComboConAlta
                label="Cliente Final (opcional)"
                value={clienteFinalId}
                onChange={setClienteFinalId}
                opciones={clientes}
                onCreado={(nuevo) => setClientes((prev) => [...prev, nuevo])}
                crearEndpoint="/api/compras/bodega/clientes-finales"
                construirBody={(nombre, extra) => ({ nombre, ruc: extra.ruc || null })}
                placeholderOpcionVacia="— sin especificar —"
                camposExtra={[{ key: 'ruc', label: 'RUC (opcional)' }]}
              />
              <ComboConAlta
                label="Lugar de Entrega (opcional)"
                value={puntoEntregaId}
                onChange={setPuntoEntregaId}
                opciones={puntosEntrega}
                onCreado={(nuevo) => setPuntosEntrega((prev) => [...prev, nuevo])}
                crearEndpoint="/api/compras/bodega/puntos-entrega"
                construirBody={(nombre) => ({ nombre, cliente_final_id: clienteFinalId || null })}
                placeholderOpcionVacia="— sin especificar —"
              />
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
                      <td className="p-2">
                        {lineas.length > 1 && <button onClick={() => eliminarLinea(idx)} className="text-red-600 text-xs hover:underline">Eliminar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-500">El costo unitario se calcula automáticamente al cerrar, al promedio ponderado vigente — no se ingresa aquí.</p>

          <Button onClick={handleCrear} disabled={guardando}>{guardando ? 'Creando...' : 'Crear Documento de Egreso'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
