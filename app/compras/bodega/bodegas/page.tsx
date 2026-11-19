'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

type Bodega = {
  id: string
  codigo: string
  nombre: string
  referencia: string | null
  activo: boolean
}

const FORM_VACIO = { codigo: '', nombre: '', referencia: '' }

// Spec: HU-026 CA-01 — CRUD de Bodegas, sin DELETE físico (solo toggle activo).
export default function BodegasPage() {
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [cargando, setCargando] = useState(true)

  const [showNuevo, setShowNuevo]           = useState(false)
  const [nuevoForm, setNuevoForm]           = useState(FORM_VACIO)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]         = useState('')

  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [editForm, setEditForm]           = useState(FORM_VACIO)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  function cargar() {
    setCargando(true)
    fetch('/api/compras/bodega/bodegas?todas=1')
      .then(r => r.json())
      .then(data => { setBodegas(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.codigo.trim() || !nuevoForm.nombre.trim()) {
      setErrorNuevo('Código y nombre son requeridos'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/bodega/bodegas', {
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

  function iniciarEdicion(b: Bodega) {
    setEditandoId(b.id)
    setEditForm({ codigo: b.codigo, nombre: b.nombre, referencia: b.referencia ?? '' })
    setErrorEdit('')
  }

  async function handleGuardarEdit() {
    if (!editForm.codigo.trim() || !editForm.nombre.trim()) {
      setErrorEdit('Código y nombre son requeridos'); return
    }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/bodega/bodegas/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function toggleActivo(b: Bodega) {
    const res  = await fetch(`/api/compras/bodega/bodegas/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !b.activo }),
    })
    const data = await res.json()
    if (data.success) cargar()
    else toast.error(data.error || 'Error al actualizar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Bodegas</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Ubicaciones físicas de almacenamiento. Desactivar una Bodega no la elimina —
              solo deja de ofrecerse en formularios nuevos.
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
            className="btn-primary text-sm">
            + Nueva Bodega
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nueva Bodega</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Código *</Label>
                  <Input value={nuevoForm.codigo} onChange={e => setNuevoForm(f => ({ ...f, codigo: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: BP" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: Bodega Principal" />
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs">Referencia / Dirección</Label>
                  <Input value={nuevoForm.referencia} onChange={e => setNuevoForm(f => ({ ...f, referencia: e.target.value }))}
                    className="mt-1 h-8 text-sm" />
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
              {cargando ? 'Cargando...' : `${bodegas.length} Bodegas`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : bodegas.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay Bodegas registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4 w-24">Código</th>
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Referencia</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bodegas.map(b => (
                      <tr key={b.id} className="border-b last:border-0">
                        {editandoId === b.id ? (
                          <td colSpan={4} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                              <Input value={editForm.codigo} onChange={e => setEditForm(f => ({ ...f, codigo: e.target.value }))}
                                className="h-8 text-sm" placeholder="Código" />
                              <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                                className="h-8 text-sm sm:col-span-2" placeholder="Nombre" />
                              <Input value={editForm.referencia} onChange={e => setEditForm(f => ({ ...f, referencia: e.target.value }))}
                                className="h-8 text-sm sm:col-span-3" placeholder="Referencia" />
                            </div>
                            {errorEdit && <p className="text-red-600 text-xs mb-2">{errorEdit}</p>}
                            <div className="flex gap-2">
                              <Button onClick={handleGuardarEdit} disabled={guardandoEdit} className="h-7 text-xs btn-primary px-3">
                                {guardandoEdit ? 'Guardando...' : 'Guardar'}
                              </Button>
                              <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 pr-4 font-medium text-slate-800">
                              <span className={b.activo ? '' : 'text-slate-400'}>{b.codigo}</span>
                            </td>
                            <td className="py-3 pr-4 text-slate-700">
                              <span className={b.activo ? '' : 'text-slate-400'}>{b.nombre}</span>
                            </td>
                            <td className="py-3 pr-4 text-slate-500">{b.referencia ?? '—'}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(b)} className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button
                                  onClick={() => toggleActivo(b)}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${b.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                >
                                  {b.activo ? 'Activa' : 'Inactiva'}
                                </button>
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
