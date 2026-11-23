'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'

type Categoria = {
  id: string
  nombre: string
  activo: boolean
  area_ids: string[]
}

type AreaBodega = { id: string; nombre: string }

// Spec: HU-026 CA-03/CA-06 — Categoría es un catálogo global; el cruce N:M a
// Áreas (habilitadas para Bodega) se edita acá como checkboxes.
export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [areas, setAreas]           = useState<AreaBodega[]>([])
  const [cargando, setCargando]     = useState(true)

  const [showNuevo, setShowNuevo]           = useState(false)
  const [nombreNuevo, setNombreNuevo]       = useState('')
  const [areasNuevo, setAreasNuevo]         = useState<Set<string>>(new Set())
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]         = useState('')

  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [nombreEdit, setNombreEdit]       = useState('')
  const [areasEdit, setAreasEdit]         = useState<Set<string>>(new Set())
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  function cargar() {
    setCargando(true)
    Promise.all([
      fetch('/api/compras/bodega/categorias?todas=1').then(r => r.json()),
      fetch('/api/compras/areas?todas=1').then(r => r.json()),
    ])
      .then(([cats, areasData]) => {
        setCategorias(Array.isArray(cats) ? cats : [])
        setAreas(
          (Array.isArray(areasData) ? areasData : [])
            .filter((a: { activo: boolean; habilitada_para_bodega: boolean }) => a.activo && a.habilitada_para_bodega)
        )
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  function toggleArea(set: Set<string>, setter: (s: Set<string>) => void, areaId: string) {
    const next = new Set(set)
    if (next.has(areaId)) next.delete(areaId)
    else next.add(areaId)
    setter(next)
  }

  async function handleCrear() {
    if (!nombreNuevo.trim()) { setErrorNuevo('El nombre es requerido'); return }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/bodega/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreNuevo, area_ids: [...areasNuevo] }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowNuevo(false); setNombreNuevo(''); setAreasNuevo(new Set()); cargar()
    } else {
      setErrorNuevo(data.error || 'Error al crear')
    }
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(c: Categoria) {
    setEditandoId(c.id)
    setNombreEdit(c.nombre)
    setAreasEdit(new Set(c.area_ids))
    setErrorEdit('')
  }

  async function handleGuardarEdit() {
    if (!nombreEdit.trim()) { setErrorEdit('El nombre es requerido'); return }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/compras/bodega/categorias/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreEdit, area_ids: [...areasEdit] }),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function toggleActivo(c: Categoria) {
    const res  = await fetch(`/api/compras/bodega/categorias/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
    })
    const data = await res.json()
    if (data.success) cargar()
    else toast.error(data.error || 'Error al actualizar')
  }

  function nombresAreas(ids: string[]) {
    if (ids.length === 0) return '—'
    return ids.map(id => areas.find(a => a.id === id)?.nombre ?? '(área inactiva)').join(', ')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Categorías</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Catálogo global de categorías de producto. Una Categoría puede estar habilitada
              para una o más Áreas simultáneamente (ej. "Cables" en Eléctrico y Niveles).
            </p>
          </div>
          <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNombreNuevo(''); setAreasNuevo(new Set()) }}
            className="btn-primary text-sm">
            + Nueva Categoría
          </Button>
        </div>

        {areas.length === 0 && !cargando && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">
              No hay ningún Área habilitada para Bodega todavía — activá el checkbox
              "Habilitada para Bodega" en <a href="/compras/coordinadores" className="underline">Áreas</a>{' '}
              antes de asociar categorías.
            </CardContent>
          </Card>
        )}

        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Nueva Categoría</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Nombre *</Label>
                <Input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)}
                  className="mt-1 h-8 text-sm" placeholder="Ej: Cables" />
              </div>
              <div>
                <Label className="text-xs">Áreas habilitadas</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {areas.map(a => (
                    <label key={a.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={areasNuevo.has(a.id)}
                        onChange={() => toggleArea(areasNuevo, setAreasNuevo, a.id)} />
                      {a.nombre}
                    </label>
                  ))}
                </div>
              </div>
              {errorNuevo && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorNuevo}</p>}
              <div className="flex gap-3">
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
              {cargando ? 'Cargando...' : `${categorias.length} Categorías`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : categorias.length === 0 ? (
              <div className="text-center py-10 text-slate-400">No hay Categorías registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Áreas</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        {editandoId === c.id ? (
                          <td colSpan={3} className="py-3">
                            <Input value={nombreEdit} onChange={e => setNombreEdit(e.target.value)}
                              className="h-8 text-sm mb-2" placeholder="Nombre" />
                            <div className="flex flex-wrap gap-3 mb-2">
                              {areas.map(a => (
                                <label key={a.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                                  <input type="checkbox" checked={areasEdit.has(a.id)}
                                    onChange={() => toggleArea(areasEdit, setAreasEdit, a.id)} />
                                  {a.nombre}
                                </label>
                              ))}
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
                            <td className="py-3 pr-4 text-slate-500">{nombresAreas(c.area_ids)}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button onClick={() => iniciarEdicion(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button
                                  onClick={() => toggleActivo(c)}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${c.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                >
                                  {c.activo ? 'Activa' : 'Inactiva'}
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
