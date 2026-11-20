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
type Linea = { producto_id: string; codigo: string; descripcion: string; cantidad: number }

// Spec: HU-031 CA-01 — creación de Orden de Ensamblaje (insumos + resultados en la misma orden).
export default function NuevoEnsamblajePage() {
  const router = useRouter()
  const [bodegaId, setBodegaId] = useState('')
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [insumos, setInsumos] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])
  const [resultados, setResultados] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  function actualizar(lista: Linea[], setLista: (l: Linea[]) => void, idx: number, campo: keyof Linea, valor: string | number) {
    setLista(lista.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }

  async function handleCrear() {
    if (!bodegaId) { toast.error('Selecciona la Bodega'); return }
    if (insumos.some((l) => !l.producto_id) || resultados.some((l) => !l.producto_id)) {
      toast.error('Toda línea requiere un producto vinculado'); return
    }
    setGuardando(true)
    try {
      const limpiar = (lineas: Linea[]) => lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }))
      const res = await fetch('/api/compras/bodega/ensamblajes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodega_id: bodegaId, insumos: limpiar(insumos), resultados: limpiar(resultados) }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al crear la orden'); return }
      toast.success(`Orden de Ensamblaje ${data.numero} creada`)
      router.push(`/compras/bodega/ensamblajes/${data.orden_id}`)
    } finally { setGuardando(false) }
  }

  function TablaLineas({ titulo, lineas, setLineas }: { titulo: string; lineas: Linea[]; setLineas: (l: Linea[]) => void }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>{titulo}</Label>
          <Button size="sm" onClick={() => setLineas([...lineas, { producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])}>+ Agregar línea</Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Cantidad</th><th className="p-2"></th></tr></thead>
          <tbody>
            {lineas.map((l, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 min-w-[260px]">
                  <ProductoSearch
                    value={l.codigo}
                    onChange={(val) => { actualizar(lineas, setLineas, idx, 'codigo', val); actualizar(lineas, setLineas, idx, 'producto_id', '') }}
                    onSelect={(item) => {
                      actualizar(lineas, setLineas, idx, 'producto_id', item.id)
                      actualizar(lineas, setLineas, idx, 'codigo', item.codigo)
                      actualizar(lineas, setLineas, idx, 'descripcion', item.descripcion)
                    }}
                  />
                  {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                </td>
                <td className="p-2 w-24"><Input type="number" value={l.cantidad} onChange={(e) => actualizar(lineas, setLineas, idx, 'cantidad', Number(e.target.value))} /></td>
                <td className="p-2">
                  {lineas.length > 1 && <button onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} className="text-red-600 text-xs hover:underline">Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Nueva Orden de Ensamblaje (Field Build)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <ComboConAlta
              label="Bodega"
              value={bodegaId}
              onChange={setBodegaId}
              opciones={bodegas}
              onCreado={(nuevo) => setBodegas((prev) => [...prev, nuevo])}
              crearEndpoint="/api/compras/bodega/bodegas"
              construirBody={(nombre, extra) => ({ nombre, codigo: extra.codigo, referencia: extra.referencia || null })}
              camposExtra={[{ key: 'codigo', label: 'Código', requerido: true }, { key: 'referencia', label: 'Referencia (opcional)' }]}
            />
          </div>

          <TablaLineas titulo="Insumos consumidos" lineas={insumos} setLineas={setInsumos} />
          <TablaLineas titulo="Producto(s) resultante(s)" lineas={resultados} setLineas={setResultados} />

          <p className="text-xs text-gray-500">El costo del resultado se calcula al confirmar, como la suma de los costos vigentes de los insumos — no se ingresa aquí.</p>

          <Button onClick={handleCrear} disabled={guardando}>{guardando ? 'Creando...' : 'Crear Orden de Ensamblaje'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
