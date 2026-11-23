'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

type Transportista = { id: string; nombre: string; identificacion: string; placa: string | null; activo: boolean }

const FORM_VACIO = { nombre: '', identificacion: '', placa: '' }

// Spec: HU-042 CA-11 — catálogo de Transportistas (bodega/compras/admin). Sin DELETE físico:
// solo desactivar, mismo criterio que el resto de catálogos de Bodega (HU-026).
export default function TransportistasPage() {
  const [lista, setLista] = useState<Transportista[]>([])
  const [cargando, setCargando] = useState(true)

  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevoForm, setNuevoForm] = useState(FORM_VACIO)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo] = useState('')

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(FORM_VACIO)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit] = useState('')

  function cargar() {
    setCargando(true)
    fetch('/api/compras/bodega/transportistas?todas=1')
      .then(r => r.json())
      .then(data => { setLista(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  async function handleCrear() {
    if (!nuevoForm.nombre.trim()) { setErrorNuevo('El nombre es requerido'); return }
    if (!nuevoForm.identificacion.trim()) { setErrorNuevo('La cédula/RUC es requerida'); return }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res = await fetch('/api/compras/bodega/transportistas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoForm),
    })
    const data = await res.json()
    if (res.ok) { setShowNuevo(false); setNuevoForm(FORM_VACIO); cargar() }
    else setErrorNuevo(data.error || 'Error al crear')
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(t: Transportista) {
    setEditandoId(t.id)
    setEditForm({ nombre: t.nombre, identificacion: t.identificacion, placa: t.placa ?? '' })
    setErrorEdit('')
  }

  async function handleGuardarEdit() {
    if (!editForm.nombre.trim() || !editForm.identificacion.trim()) { setErrorEdit('Nombre y cédula/RUC son requeridos'); return }
    setGuardandoEdit(true); setErrorEdit('')
    const res = await fetch(`/api/compras/bodega/transportistas/${editandoId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (res.ok) { setEditandoId(null); cargar() } else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function toggleActivo(t: Transportista) {
    const res = await fetch(`/api/compras/bodega/transportistas/${t.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !t.activo }),
    })
    if (res.ok) cargar()
    else toast.error((await res.json()).error || 'Error al actualizar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Transportistas</h1>
            <p className="text-slate-500 text-sm mt-0.5">Choferes y vehículos que aparecen en las guías de remisión.</p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }} className="btn-primary text-sm">
            + Nuevo Transportista
          </Button>
        </div>

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nuevo Transportista</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Cédula / RUC *</Label>
                  <Input value={nuevoForm.identificacion} onChange={e => setNuevoForm(f => ({ ...f, identificacion: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Placa habitual</Label>
                  <Input value={nuevoForm.placa} onChange={e => setNuevoForm(f => ({ ...f, placa: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="PFQ-2422" />
                </div>
              </div>
              {errorNuevo && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{errorNuevo}</p>}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="btn-primary">{guardandoNuevo ? 'Guardando...' : 'Crear'}</Button>
                <Button variant="outline" onClick={() => setShowNuevo(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">{cargando ? 'Cargando...' : `${lista.length} Transportistas`}</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : lista.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay transportistas registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Cédula / RUC</th>
                      <th className="text-left py-3 pr-4">Placa</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(t => (
                      <tr key={t.id} className="border-b last:border-0">
                        {editandoId === t.id ? (
                          <td colSpan={4} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                              <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} className="h-8 text-sm" placeholder="Nombre" />
                              <Input value={editForm.identificacion} onChange={e => setEditForm(f => ({ ...f, identificacion: e.target.value }))} className="h-8 text-sm" placeholder="Cédula / RUC" />
                              <Input value={editForm.placa} onChange={e => setEditForm(f => ({ ...f, placa: e.target.value }))} className="h-8 text-sm" placeholder="Placa" />
                            </div>
                            {errorEdit && <p className="text-red-600 text-xs mb-2">{errorEdit}</p>}
                            <div className="flex gap-2">
                              <Button onClick={handleGuardarEdit} disabled={guardandoEdit} className="h-7 text-xs btn-primary px-3">{guardandoEdit ? 'Guardando...' : 'Guardar'}</Button>
                              <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 pr-4 font-medium text-slate-800"><span className={t.activo ? '' : 'text-slate-400'}>{t.nombre}</span></td>
                            <td className="py-3 pr-4 text-slate-500 font-mono">{t.identificacion}</td>
                            <td className="py-3 pr-4 text-slate-500 font-mono">{t.placa ?? '—'}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(t)} className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button
                                  onClick={() => toggleActivo(t)}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${t.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                >
                                  {t.activo ? 'Activo' : 'Inactivo'}
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
