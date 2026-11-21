'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { ProductoSearch } from '@/components/ProductoSearch'
import { AltaProductoRapida } from '@/components/AltaProductoRapida'

type Linea = { id: string; producto_id: string; codigo?: string | null; descripcion?: string | null; cantidad: number }
type Orden = { id: string; numero: string; estado: string; insumos: Linea[]; resultados: Linea[] }

const ESTADO_LABEL: Record<string, string> = { generada: 'Generada', confirmada: 'Confirmada' }

// Spec: HU-031 CA-01/CA-02/CA-03/CA-06 — detalle, edición y confirmación.
export default function DetalleEnsamblajePage() {
  const { id } = useParams<{ id: string }>()
  const [orden, setOrden] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(true)
  const [insumosEdit, setInsumosEdit] = useState<Linea[]>([])
  const [resultadosEdit, setResultadosEdit] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/bodega/ensamblajes/${id}`)
      .then((r) => r.json())
      .then((data) => { setOrden(data); setInsumosEdit(data?.insumos ?? []); setResultadosEdit(data?.resultados ?? []); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { if (id) cargar() }, [id])

  const editable = orden && orden.estado === 'generada'

  async function handleGuardar() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/compras/bodega/ensamblajes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insumos: insumosEdit, resultados: resultadosEdit }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Error al guardar'); return }
      toast.success('Orden actualizada')
      cargar()
    } finally { setGuardando(false) }
  }

  async function handleConfirmar() {
    setConfirmando(true)
    try {
      const res = await fetch(`/api/compras/bodega/ensamblajes/${id}/confirmar`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error + (data.insumos_excedidos?.length ? `: ${data.insumos_excedidos.join(', ')}` : ''))
        return
      }
      toast.success('Orden confirmada — Kardex generado')
      cargar()
    } finally { setConfirmando(false) }
  }

  if (cargando) return <div className="p-6">Cargando...</div>
  if (!orden) return <div className="p-6">Orden no encontrada.</div>

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Orden de Ensamblaje {orden.numero}</CardTitle></CardHeader>
        <CardContent className="text-sm"><p><strong>Estado:</strong> {ESTADO_LABEL[orden.estado] ?? orden.estado}</p></CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader><CardTitle>Insumos consumidos</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Cantidad</th></tr></thead>
            <tbody>
              {insumosEdit.map((l, idx) => (
                <tr key={l.id || idx} className="border-b">
                  <td className="p-2 min-w-[260px]">{editable ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <ProductoSearch
                          value={l.codigo ?? ''}
                          onChange={(val) => setInsumosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, codigo: val, producto_id: '' } : x))}
                          onSelect={(item) => setInsumosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, producto_id: item.id, codigo: item.codigo, descripcion: item.descripcion } : x))}
                        />
                        {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                      </div>
                      <AltaProductoRapida onCreado={(item) => setInsumosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, producto_id: item.id, codigo: item.codigo, descripcion: item.descripcion } : x))} />
                    </div>
                  ) : (<><span className="font-mono text-xs text-slate-400 mr-1">{l.codigo ?? l.producto_id}</span>{l.descripcion}</>)}</td>
                  <td className="p-2 w-24">{editable ? (
                    <Input type="number" value={l.cantidad} onChange={(e) => setInsumosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, cantidad: Number(e.target.value) } : x))} />
                  ) : l.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader><CardTitle>Producto(s) resultante(s)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Cantidad</th></tr></thead>
            <tbody>
              {resultadosEdit.map((l, idx) => (
                <tr key={l.id || idx} className="border-b">
                  <td className="p-2 min-w-[260px]">{editable ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <ProductoSearch
                          value={l.codigo ?? ''}
                          onChange={(val) => setResultadosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, codigo: val, producto_id: '' } : x))}
                          onSelect={(item) => setResultadosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, producto_id: item.id, codigo: item.codigo, descripcion: item.descripcion } : x))}
                        />
                        {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                      </div>
                      <AltaProductoRapida onCreado={(item) => setResultadosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, producto_id: item.id, codigo: item.codigo, descripcion: item.descripcion } : x))} />
                    </div>
                  ) : (<><span className="font-mono text-xs text-slate-400 mr-1">{l.codigo ?? l.producto_id}</span>{l.descripcion}</>)}</td>
                  <td className="p-2 w-24">{editable ? (
                    <Input type="number" value={l.cantidad} onChange={(e) => setResultadosEdit((prev) => prev.map((x, i) => i === idx ? { ...x, cantidad: Number(e.target.value) } : x))} />
                  ) : l.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {editable && (
            <div className="flex gap-2 mt-4">
              <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar Cambios'}</Button>
              <Button onClick={handleConfirmar} disabled={confirmando} className="bg-green-700 hover:bg-green-800">
                {confirmando ? 'Confirmando...' : 'Confirmar Ensamblaje'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
