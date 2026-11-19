'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'

type Linea = {
  id: string
  producto_id: string | null
  codigo_oc: string | null
  descripcion_oc: string
  cantidad: number
  costo_unitario: number
  justificacion: string | null
}

type Documento = {
  id: string
  numero: string
  estado: string
  numero_oc: string | null
  created_at: string
  cerrado_en: string | null
  motivo_anulacion: string | null
  lineas: Linea[]
}

type Producto = { id: string; codigo: string; descripcion: string }

const ESTADO_LABEL: Record<string, string> = {
  generado: 'Generado', en_validacion: 'En Validación', cerrado: 'Cerrado', anulado: 'Anulado',
}

// Spec: HU-028 CA-03/CA-04/CA-05 — detalle, edición de líneas y cierre con
// generación de Kardex.
export default function DetalleIngresoPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Documento | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [lineasEdit, setLineasEdit] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  function cargar() {
    setCargando(true)
    Promise.all([
      fetch(`/api/compras/bodega/ingresos/${id}`).then((r) => r.json()),
      fetch('/api/compras/bodega/bodegas?todas=1').then(() => null),
    ]).then(([data]) => {
      setDoc(data)
      setLineasEdit(data?.lineas ?? [])
      setCargando(false)
    }).catch(() => setCargando(false))

    fetch('/api/compras/inventario')
      .then((r) => r.json())
      .then((data) => setProductos(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  useEffect(() => { if (id) cargar() }, [id])

  const editable = doc && ['generado', 'en_validacion'].includes(doc.estado)

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string | number | null) {
    setLineasEdit((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }

  function eliminarLinea(idx: number) {
    setLineasEdit((prev) => prev.filter((_, i) => i !== idx))
  }

  function agregarLinea() {
    setLineasEdit((prev) => [
      ...prev,
      { id: '', producto_id: null, codigo_oc: null, descripcion_oc: '', cantidad: 0, costo_unitario: 0, justificacion: null },
    ])
  }

  async function handleGuardar() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/compras/bodega/ingresos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineas: lineasEdit }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Error al guardar')
        return
      }
      toast.success('Documento de Ingreso actualizado')
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function handleCerrar() {
    setCerrando(true)
    try {
      const res = await fetch(`/api/compras/bodega/ingresos/${id}/cerrar`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error + (data.lineas_invalidas?.length ? `: ${data.lineas_invalidas.join(', ')}` : ''))
        return
      }
      toast.success('Documento cerrado — Kardex generado')
      cargar()
    } finally {
      setCerrando(false)
    }
  }

  if (cargando) return <div className="p-6">Cargando...</div>
  if (!doc) return <div className="p-6">Documento no encontrado.</div>

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Documento de Ingreso {doc.numero}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Estado:</strong> {ESTADO_LABEL[doc.estado] ?? doc.estado}</p>
          {doc.numero_oc && <p><strong>OC de origen:</strong> {doc.numero_oc}</p>}
          {doc.motivo_anulacion && <p className="text-red-600"><strong>Anulado:</strong> {doc.motivo_anulacion}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Líneas</CardTitle>
          {editable && <Button size="sm" onClick={agregarLinea}>+ Agregar línea</Button>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Código OC</th>
                  <th className="p-2">Descripción</th>
                  <th className="p-2">Producto vinculado</th>
                  <th className="p-2">Cantidad</th>
                  <th className="p-2">Costo Unitario</th>
                  <th className="p-2">Justificación</th>
                  {editable && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody>
                {lineasEdit.map((l, idx) => (
                  <tr key={l.id || idx} className={`border-b ${!l.producto_id ? 'bg-amber-50' : ''}`}>
                    <td className="p-2">{l.codigo_oc ?? '—'}</td>
                    <td className="p-2">
                      {editable ? (
                        <Input value={l.descripcion_oc} onChange={(e) => actualizarLinea(idx, 'descripcion_oc', e.target.value)} />
                      ) : l.descripcion_oc}
                    </td>
                    <td className="p-2">
                      {editable ? (
                        <select
                          className="border rounded px-2 py-1 text-sm w-full"
                          value={l.producto_id ?? ''}
                          onChange={(e) => actualizarLinea(idx, 'producto_id', e.target.value || null)}
                        >
                          <option value="">— sin producto vinculado —</option>
                          {productos.map((p) => (
                            <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>
                          ))}
                        </select>
                      ) : (productos.find((p) => p.id === l.producto_id)?.codigo ?? '— sin vincular —')}
                    </td>
                    <td className="p-2 w-24">
                      {editable ? (
                        <Input type="number" value={l.cantidad} onChange={(e) => actualizarLinea(idx, 'cantidad', Number(e.target.value))} />
                      ) : l.cantidad}
                    </td>
                    <td className="p-2 w-28">
                      {editable ? (
                        <Input type="number" value={l.costo_unitario} onChange={(e) => actualizarLinea(idx, 'costo_unitario', Number(e.target.value))} />
                      ) : l.costo_unitario}
                    </td>
                    <td className="p-2">
                      {editable ? (
                        <Input value={l.justificacion ?? ''} onChange={(e) => actualizarLinea(idx, 'justificacion', e.target.value)} />
                      ) : (l.justificacion ?? '—')}
                    </td>
                    {editable && (
                      <td className="p-2">
                        <button onClick={() => eliminarLinea(idx)} className="text-red-600 text-xs hover:underline">Eliminar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="flex gap-2 mt-4">
              <Button onClick={handleGuardar} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
              <Button onClick={handleCerrar} disabled={cerrando} className="bg-green-700 hover:bg-green-800">
                {cerrando ? 'Cerrando...' : 'Cerrar e Ingresar a Bodega'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
