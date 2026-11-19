'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

type ClienteFinal = {
  id: string
  nombre: string
  ruc: string | null
  activo: boolean
}

const FORM_VACIO = { nombre: '', ruc: '' }

// Spec: HU-026 CA-07 — roles bodega/compras/admin pueden escribir este catálogo.
export default function ClientesFinalesPage() {
  const [clientes, setClientes] = useState<ClienteFinal[]>([])
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
    fetch('/api/compras/bodega/clientes-finales?todas=1')
      .then(r => r.json())
      .then(data => { setClientes(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.nombre.trim()) { setErrorNuevo('El nombre es requerido'); return }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/bodega/clientes-finales', {
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

  function iniciarEdicion(c: ClienteFinal) {
    setEditandoId(c.id)
    setEditForm({ nombre: c.nombre, ruc: c.ruc ?? '' })
    setErrorEdit('')
  }

  async function handleGuardarEdit() {
    if (!editForm.nombre.trim()) { setErrorEdit('El nombre es requerido'); return }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/bodega/clientes-finales/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function toggleActivo(c: ClienteFinal) {
    const res  = await fetch(`/api/compras/bodega/clientes-finales/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
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
            <h1 className="text-2xl font-bold text-slate-800">Clientes Finales</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Empresas a las que ARLIFT presta servicio y a las que se registra el consumo de material.
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
            className="btn-primary text-sm">
            + Nuevo Cliente Final
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nuevo Cliente Final</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: ANDES PETROLEUM" />
                </div>
                <div>
                  <Label className="text-xs">RUC</Label>
                  <Input value={nuevoForm.ruc} onChange={e => setNuevoForm(f => ({ ...f, ruc: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="13 dígitos (opcional)" />
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
              {cargando ? 'Cargando...' : `${clientes.length} Clientes Finales`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : clientes.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay Clientes Finales registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">RUC</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        {editandoId === c.id ? (
                          <td colSpan={3} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                              <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                                className="h-8 text-sm" placeholder="Nombre" />
                              <Input value={editForm.ruc} onChange={e => setEditForm(f => ({ ...f, ruc: e.target.value }))}
                                className="h-8 text-sm" placeholder="RUC" />
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
                              <span className={c.activo ? '' : 'text-slate-400'}>{c.nombre}</span>
                            </td>
                            <td className="py-3 pr-4 text-slate-500">{c.ruc ?? '—'}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button
                                  onClick={() => toggleActivo(c)}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${c.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                >
                                  {c.activo ? 'Activo' : 'Inactivo'}
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
