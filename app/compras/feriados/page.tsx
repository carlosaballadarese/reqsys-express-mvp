'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Feriado = {
  id: string
  fecha: string
  descripcion: string
}

const FORM_VACIO = { fecha: '', descripcion: '' }

// Spec: HU-009 CA-10, CA-11, CA-12
export default function FeriadosPage() {
  const [feriados, setFeriados] = useState<Feriado[]>([])
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
    fetch('/api/compras/feriados')
      .then(r => r.json())
      .then(data => { setFeriados(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.fecha || !nuevoForm.descripcion) {
      setErrorNuevo('Fecha y descripción son requeridas'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/feriados', {
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

  function iniciarEdicion(f: Feriado) {
    setEditandoId(f.id)
    setEditForm({ fecha: f.fecha, descripcion: f.descripcion })
    setErrorEdit('')
    setEliminandoId(null)
  }

  async function handleGuardarEdit() {
    if (!editForm.fecha || !editForm.descripcion) {
      setErrorEdit('Fecha y descripción son requeridas'); return
    }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/feriados/${editandoId}`, {
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
    const res  = await fetch(`/api/compras/feriados/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { setEliminandoId(null); cargar() }
    else alert(data.error || 'Error al eliminar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Feriados</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Días no laborables considerados en el cálculo de SLA de Notas de Pedido
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
            className="btn-primary text-sm">
            + Nuevo Feriado
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nuevo Feriado</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Fecha *</Label>
                  <Input type="date" value={nuevoForm.fecha} onChange={e => setNuevoForm(f => ({ ...f, fecha: e.target.value }))}
                    className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Descripción *</Label>
                  <Input value={nuevoForm.descripcion} onChange={e => setNuevoForm(f => ({ ...f, descripcion: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: Fundación de Quito" />
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
              {cargando ? 'Cargando...' : `${feriados.length} feriados`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : feriados.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay feriados registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4 w-32">Fecha</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-left py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {feriados.map(f => (
                      <tr key={f.id} className="border-b last:border-0">
                        {editandoId === f.id ? (
                          <td colSpan={3} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                              <div>
                                <Label className="text-xs">Fecha</Label>
                                <Input type="date" value={editForm.fecha} onChange={e => setEditForm(f => ({ ...f, fecha: e.target.value }))}
                                  className="mt-1 h-8 text-sm" />
                              </div>
                              <div>
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
                            <td className="py-3 pr-4 font-medium text-slate-800">{f.fecha}</td>
                            <td className="py-3 pr-4 text-slate-700">{f.descripcion}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(f)}
                                  className="text-xs text-blue-600 hover:underline">
                                  Editar
                                </button>
                                {eliminandoId === f.id ? (
                                  <span className="flex items-center gap-1">
                                    <button onClick={() => handleEliminar(f.id)}
                                      className="text-xs text-red-600 font-semibold hover:underline">
                                      Confirmar
                                    </button>
                                    <button onClick={() => setEliminandoId(null)}
                                      className="text-xs text-slate-400 hover:underline">
                                      / Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={() => { setEliminandoId(f.id); setEditandoId(null) }}
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
