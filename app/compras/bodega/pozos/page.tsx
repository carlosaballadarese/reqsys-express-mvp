'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

type Pozo = {
  id: string
  nombre: string
  cliente_final_id: string | null
  activo: boolean
}

type ClienteFinal = { id: string; nombre: string }

const FORM_VACIO = { nombre: '', cliente_final_id: '' }

// Spec: HU-026 CA-08 — Cliente Final opcional (destinos internos como
// "ARLIFT - BASE" que no pertenecen a ningún cliente).
export default function PozosPage() {
  const [pozos, setPozos]     = useState<Pozo[]>([])
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
    Promise.all([
      fetch('/api/compras/bodega/pozos?todas=1').then(r => r.json()),
      fetch('/api/compras/bodega/clientes-finales').then(r => r.json()),
    ])
      .then(([pozosData, clientesData]) => {
        setPozos(Array.isArray(pozosData) ? pozosData : [])
        setClientes(Array.isArray(clientesData) ? clientesData : [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.nombre.trim()) { setErrorNuevo('El nombre es requerido'); return }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/bodega/pozos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevoForm.nombre, cliente_final_id: nuevoForm.cliente_final_id || null }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowNuevo(false); setNuevoForm(FORM_VACIO); cargar()
    } else {
      setErrorNuevo(data.error || 'Error al crear')
    }
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(p: Pozo) {
    setEditandoId(p.id)
    setEditForm({ nombre: p.nombre, cliente_final_id: p.cliente_final_id ?? '' })
    setErrorEdit('')
  }

  async function handleGuardarEdit() {
    if (!editForm.nombre.trim()) { setErrorEdit('El nombre es requerido'); return }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/bodega/pozos/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editForm.nombre, cliente_final_id: editForm.cliente_final_id || null }),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function toggleActivo(p: Pozo) {
    const res  = await fetch(`/api/compras/bodega/pozos/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !p.activo }),
    })
    const data = await res.json()
    if (data.success) cargar()
    else toast.error(data.error || 'Error al actualizar')
  }

  function nombreCliente(id: string | null) {
    if (!id) return '— (destino interno)'
    return clientes.find(c => c.id === id)?.nombre ?? '(cliente inactivo)'
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Pozos</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Pozos de un Cliente Final, o destinos internos de ARLIFT (Cliente Final opcional).
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
            className="btn-primary text-sm">
            + Nuevo Pozo
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nuevo Pozo</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nombre / Código *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Ej: ARLIFT - BASE" />
                </div>
                <div>
                  <Label className="text-xs">Cliente Final</Label>
                  <select
                    value={nuevoForm.cliente_final_id}
                    onChange={e => setNuevoForm(f => ({ ...f, cliente_final_id: e.target.value }))}
                    className="mt-1 h-8 text-sm w-full border rounded-md px-2"
                  >
                    <option value="">— (destino interno, sin Cliente Final)</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
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
              {cargando ? 'Cargando...' : `${pozos.length} Pozos`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : pozos.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay Pozos registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Cliente Final</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pozos.map(p => (
                      <tr key={p.id} className="border-b last:border-0">
                        {editandoId === p.id ? (
                          <td colSpan={3} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                              <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                                className="h-8 text-sm" placeholder="Nombre" />
                              <select
                                value={editForm.cliente_final_id}
                                onChange={e => setEditForm(f => ({ ...f, cliente_final_id: e.target.value }))}
                                className="h-8 text-sm border rounded-md px-2"
                              >
                                <option value="">— (destino interno)</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                              </select>
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
                              <span className={p.activo ? '' : 'text-slate-400'}>{p.nombre}</span>
                            </td>
                            <td className="py-3 pr-4 text-slate-500">{nombreCliente(p.cliente_final_id)}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button
                                  onClick={() => toggleActivo(p)}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${p.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                >
                                  {p.activo ? 'Activo' : 'Inactivo'}
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
