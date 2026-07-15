'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Accion = {
  id: string
  orden: number
  descripcion: string
}

const FORM_VACIO = { orden: '', descripcion: '' }

// Spec: HU-009 CA-17, CA-18
export default function AccionesPage() {
  const [acciones, setAcciones] = useState<Accion[]>([])
  const [cargando, setCargando] = useState(true)

  const [showNuevo, setShowNuevo]           = useState(false)
  const [nuevoForm, setNuevoForm]           = useState(FORM_VACIO)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]         = useState('')

  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [editForm, setEditForm]           = useState(FORM_VACIO)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  function cargar() {
    setCargando(true)
    fetch('/api/compras/acciones')
      .then(r => r.json())
      .then(data => { setAcciones(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.orden || !nuevoForm.descripcion) {
      setErrorNuevo('Orden y descripción son requeridos'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/acciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden: Number(nuevoForm.orden), descripcion: nuevoForm.descripcion }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowNuevo(false); setNuevoForm(FORM_VACIO); cargar()
    } else {
      setErrorNuevo(data.error || 'Error al crear')
    }
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(a: Accion) {
    setEditandoId(a.id)
    setEditForm({ orden: String(a.orden), descripcion: a.descripcion })
    setErrorEdit('')
    setEliminandoId(null)
  }

  async function handleGuardarEdit() {
    if (!editForm.orden || !editForm.descripcion) {
      setErrorEdit('Orden y descripción son requeridos'); return
    }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/acciones/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden: Number(editForm.orden), descripcion: editForm.descripcion }),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function handleEliminar(id: string) {
    const res  = await fetch(`/api/compras/acciones/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { setEliminandoId(null); cargar() }
    else alert(data.error || 'Error al eliminar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Acciones de Gestión</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Checklist que el comprador marca durante la gestión de compra de una NP
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
            className="btn-primary text-sm">
            + Nueva Acción
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nueva Acción</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Orden *</Label>
                  <Input type="number" value={nuevoForm.orden} onChange={e => setNuevoForm(f => ({ ...f, orden: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: 7" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Descripción *</Label>
                  <Input value={nuevoForm.descripcion} onChange={e => setNuevoForm(f => ({ ...f, descripcion: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: Ofertas recibidas" />
                </div>
              </div>
              {errorNuevo && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{errorNuevo}</p>}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="btn-primary">
                  {guardandoNuevo ? 'Guardando...' : 'Crear'}
                </Button>
                <Button variant="outline" onClick={() => setShowNuevo(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${acciones.length} Acciones`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : acciones.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay Acciones registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4 w-20">Orden</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-left py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {acciones.map(a => (
                      <tr key={a.id} className="border-b last:border-0">
                        {editandoId === a.id ? (
                          <td colSpan={3} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                              <div>
                                <Label className="text-xs">Orden</Label>
                                <Input type="number" value={editForm.orden} onChange={e => setEditForm(f => ({ ...f, orden: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-xs">Descripción</Label>
                                <Input value={editForm.descripcion} onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                            </div>
                            {errorEdit && <p className="text-red-600 text-xs mb-2">{errorEdit}</p>}
                            <div className="flex gap-2">
                              <Button onClick={handleGuardarEdit} disabled={guardandoEdit}
                                className="h-7 text-xs btn-primary px-3">
                                {guardandoEdit ? 'Guardando...' : 'Guardar'}
                              </Button>
                              <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 pr-4 font-medium text-slate-800">{a.orden}</td>
                            <td className="py-3 pr-4 text-slate-700">{a.descripcion}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(a)}
                                  className="text-xs text-blue-600 hover:underline">
                                  Editar
                                </button>
                                {eliminandoId === a.id ? (
                                  <span className="flex items-center gap-1">
                                    <button onClick={() => handleEliminar(a.id)}
                                      className="text-xs text-red-600 font-semibold hover:underline">
                                      Confirmar
                                    </button>
                                    <button onClick={() => setEliminandoId(null)}
                                      className="text-xs text-slate-400 hover:underline">
                                      / Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setEliminandoId(a.id); setEditandoId(null) }}
                                    className="text-xs text-red-400 hover:text-red-600 hover:underline">
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
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
