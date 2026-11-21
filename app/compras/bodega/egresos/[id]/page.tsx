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
type Documento = {
  id: string
  numero: string
  tipo: string
  estado: string
  override_admin: boolean
  justificacion_override: string | null
  lineas: Linea[]
}

const ESTADO_LABEL: Record<string, string> = { generado: 'Generado', en_validacion: 'En Validación', cerrado: 'Cerrado' }

// Spec: HU-030 CA-01/CA-02/CA-03/CA-06 — detalle, edición y cierre del Egreso.
export default function DetalleEgresoPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Documento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [lineasEdit, setLineasEdit] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [mostrarOverride, setMostrarOverride] = useState(false)
  const [justificacion, setJustificacion] = useState('')
  // Spec: HU-037 — etiqueta de Tipo desde el catálogo (reemplaza el mapeo
  // hardcodeado), mismo criterio que ingresos/[id]/page.tsx.
  const [tiposEgreso, setTiposEgreso] = useState<{ codigo: string; nombre: string }[]>([])

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/bodega/egresos/${id}`)
      .then((r) => r.json())
      .then((data) => { setDoc(data); setLineasEdit(data?.lineas ?? []); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { if (id) cargar() }, [id])
  useEffect(() => {
    fetch('/api/compras/bodega/tipos-egreso').then((r) => r.json()).then((d) => setTiposEgreso(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const editable = doc && ['generado', 'en_validacion'].includes(doc.estado)

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string | number | null) {
    setLineasEdit((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }
  function eliminarLinea(idx: number) { setLineasEdit((prev) => prev.filter((_, i) => i !== idx)) }
  function agregarLinea() { setLineasEdit((prev) => [...prev, { id: '', producto_id: '', codigo: '', descripcion: '', cantidad: 0 }]) }

  async function handleGuardar() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/compras/bodega/egresos/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineas: lineasEdit }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Error al guardar'); return }
      toast.success('Documento de Egreso actualizado')
      cargar()
    } finally { setGuardando(false) }
  }

  async function handleCerrar(conOverride: boolean) {
    setCerrando(true)
    try {
      const res = await fetch(`/api/compras/bodega/egresos/${id}/cerrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conOverride ? { override: true, justificacion } : {}),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.lineas_excedidas?.length) {
          toast.error(`Saldo insuficiente: ${data.lineas_excedidas.join(', ')}`)
          setMostrarOverride(true)
        } else {
          toast.error(data.error ?? 'Error al cerrar')
        }
        return
      }
      toast.success('Documento cerrado — Kardex generado')
      setMostrarOverride(false)
      cargar()
    } finally { setCerrando(false) }
  }

  if (cargando) return <div className="p-6">Cargando...</div>
  if (!doc) return <div className="p-6">Documento no encontrado.</div>

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Documento de Egreso {doc.numero}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Tipo:</strong> {tiposEgreso.find((t) => t.codigo === doc.tipo)?.nombre ?? doc.tipo}</p>
          <p><strong>Estado:</strong> {ESTADO_LABEL[doc.estado] ?? doc.estado}</p>
          {doc.override_admin && (
            <p className="text-red-600"><strong>Cerrado con override de saldo:</strong> {doc.justificacion_override}</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Líneas</CardTitle>
          {editable && <Button size="sm" onClick={agregarLinea}>+ Agregar línea</Button>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Producto</th>
                  <th className="p-2">Cantidad</th>
                  {editable && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody>
                {lineasEdit.map((l, idx) => (
                  <tr key={l.id || idx} className="border-b">
                    <td className="p-2 min-w-[260px]">
                      {editable ? (
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <ProductoSearch
                              value={l.codigo ?? ''}
                              onChange={(val) => { actualizarLinea(idx, 'codigo', val); actualizarLinea(idx, 'producto_id', '') }}
                              onSelect={(item) => {
                                actualizarLinea(idx, 'producto_id', item.id)
                                actualizarLinea(idx, 'codigo', item.codigo)
                                actualizarLinea(idx, 'descripcion', item.descripcion)
                              }}
                            />
                            {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                          </div>
                          <AltaProductoRapida onCreado={(item) => {
                            actualizarLinea(idx, 'producto_id', item.id)
                            actualizarLinea(idx, 'codigo', item.codigo)
                            actualizarLinea(idx, 'descripcion', item.descripcion)
                          }} />
                        </div>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-slate-400 mr-1">{l.codigo ?? l.producto_id}</span>
                          {l.descripcion}
                        </>
                      )}
                    </td>
                    <td className="p-2 w-24">
                      {editable ? (
                        <Input type="number" value={l.cantidad} onChange={(e) => actualizarLinea(idx, 'cantidad', Number(e.target.value))} />
                      ) : l.cantidad}
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
            <div className="space-y-3 mt-4">
              <div className="flex gap-2">
                <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar Cambios'}</Button>
                <Button onClick={() => handleCerrar(false)} disabled={cerrando} className="bg-green-700 hover:bg-green-800">
                  {cerrando ? 'Cerrando...' : 'Cerrar y Egresar de Bodega'}
                </Button>
              </div>
              {mostrarOverride && (
                <div className="border border-red-300 rounded p-3 bg-red-50 space-y-2">
                  <p className="text-sm text-red-700">Saldo insuficiente — solo un rol admin puede forzar el cierre con justificación.</p>
                  <Input placeholder="Justificación del override" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
                  <Button size="sm" onClick={() => handleCerrar(true)} disabled={cerrando || !justificacion.trim()} className="bg-red-700 hover:bg-red-800">
                    Forzar cierre con override (solo admin)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
