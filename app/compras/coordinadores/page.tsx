'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Coordinador = {
  id: string
  area: string
  nombre: string
  email: string
}

const FORM_VACIO = { area: '', nombre: '', email: '' }

export default function CoordinadoresPage() {
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([])
  const [cargando, setCargando]           = useState(true)

  const [showNuevo, setShowNuevo]         = useState(false)
  const [nuevoForm, setNuevoForm]         = useState(FORM_VACIO)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]       = useState('')

  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [editForm, setEditForm]           = useState(FORM_VACIO)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  const [eliminandoId, setEliminandoId]   = useState<string | null>(null)

  function cargar() {
    setCargando(true)
    fetch('/api/coordinadores')
      .then(r => r.json())
      .then(data => { setCoordinadores(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.area || !nuevoForm.nombre || !nuevoForm.email) {
      setErrorNuevo('Todos los campos son requeridos'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/coordinadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoForm),
    })
    const data = await res.json()
    if (res.ok) {
      setShowNuevo(false); setNuevoForm(FORM_VACIO); cargar()
    } else {
      setErrorNuevo(data.error || 'Error al crear')
    }
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(c: Coordinador) {
    setEditandoId(c.id)
    setEditForm({ area: c.area, nombre: c.nombre, email: c.email })
    setErrorEdit('')
    setEliminandoId(null)
  }

  async function handleGuardarEdit() {
    if (!editForm.area || !editForm.nombre || !editForm.email) {
      setErrorEdit('Todos los campos son requeridos'); return
    }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/coordinadores/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function handleEliminar(id: string) {
    const res  = await fetch(`/api/coordinadores/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { setEliminandoId(null); cargar() }
    else alert(data.error || 'Error al eliminar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Coordinadores de Área</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Responsables de aprobar Notas de Pedido por área
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/exportar/coordinadores" download>
              <Button variant="outline" className="text-sm">⬇ Excel</Button>
            </a>
            <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
              className="bg-blue-700 hover:bg-blue-800 text-sm">
              + Nuevo Coordinador
            </Button>
          </div>
        </div>

        {/* Formulario nuevo */}
        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nuevo Coordinador</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Área *</Label>
                  <Input value={nuevoForm.area} onChange={e => setNuevoForm(f => ({ ...f, area: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: Operaciones" />
                </div>
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Nombre Apellido" />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={nuevoForm.email} onChange={e => setNuevoForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="coordinador@arlift.com.ec" />
                </div>
              </div>
              {errorNuevo && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{errorNuevo}</p>}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="bg-blue-700 hover:bg-blue-800">
                  {guardandoNuevo ? 'Guardando...' : 'Crear'}
                </Button>
                <Button variant="outline" onClick={() => setShowNuevo(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${coordinadores.length} coordinadores`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : coordinadores.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay coordinadores registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4 w-48">Área</th>
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Email</th>
                      <th className="text-left py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coordinadores.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        {editandoId === c.id ? (
                          <td colSpan={4} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                              <div>
                                <Label className="text-xs">Área</Label>
                                <Input value={editForm.area} onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                              <div>
                                <Label className="text-xs">Nombre</Label>
                                <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                              <div>
                                <Label className="text-xs">Email</Label>
                                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                            </div>
                            {errorEdit && <p className="text-red-600 text-xs mb-2">{errorEdit}</p>}
                            <div className="flex gap-2">
                              <Button onClick={handleGuardarEdit} disabled={guardandoEdit}
                                className="h-7 text-xs bg-blue-700 hover:bg-blue-800 px-3">
                                {guardandoEdit ? 'Guardando...' : 'Guardar'}
                              </Button>
                              <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 pr-4 font-medium text-slate-800">{c.area}</td>
                            <td className="py-3 pr-4 text-slate-700">{c.nombre}</td>
                            <td className="py-3 pr-4 text-slate-500 text-xs">{c.email}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(c)}
                                  className="text-xs text-blue-600 hover:underline">
                                  Editar
                                </button>
                                {eliminandoId === c.id ? (
                                  <span className="flex items-center gap-1">
                                    <button onClick={() => handleEliminar(c.id)}
                                      className="text-xs text-red-600 font-semibold hover:underline">
                                      Confirmar
                                    </button>
                                    <button onClick={() => setEliminandoId(null)}
                                      className="text-xs text-slate-400 hover:underline">
                                      / Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setEliminandoId(c.id); setEditandoId(null) }}
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
