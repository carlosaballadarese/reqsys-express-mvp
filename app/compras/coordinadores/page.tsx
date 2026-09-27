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
  area_id: string | null
  nombre: string
  email: string
  activo: boolean
}

type AreaCatalogo = { id: string; nombre: string; activo: boolean }

// Spec: SC-002 — el form identifica el área por id, seleccionada de un
// catálogo con CRUD propio (ver sección "Áreas" más abajo).
type FormCoordinador = { area_id: string; nombre: string; email: string }
const FORM_VACIO: FormCoordinador = { area_id: '', nombre: '', email: '' }

type Alternativo = { id: string; coordinador_id: string; coordinadores_area: Coordinador | null }

export default function CoordinadoresPage() {
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([])
  const [areas, setAreas]                 = useState<AreaCatalogo[]>([])
  const [cargando, setCargando]           = useState(true)

  const [showNuevo, setShowNuevo]         = useState(false)
  const [nuevoForm, setNuevoForm]         = useState<FormCoordinador>(FORM_VACIO)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]       = useState('')

  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [editForm, setEditForm]           = useState({ area_id: '', nombre: '', email: '' })
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  const [eliminandoId, setEliminandoId]   = useState<string | null>(null)
  // Spec: SC-002 CA-11 — si el DELETE responde 409, se muestran los motivos
  // en vez de un alert genérico.
  const [errorEliminar, setErrorEliminar] = useState<{ id: string; motivos: string[] } | null>(null)

  // Spec: SC-002 CA-09 — gestión de aprobadores alternativos por área.
  const [areaAltSel, setAreaAltSel]       = useState('')
  const [altList, setAltList]             = useState<Alternativo[]>([])
  const [cargandoAlt, setCargandoAlt]     = useState(false)
  const [nuevoAltId, setNuevoAltId]       = useState('')
  const [errorAlt, setErrorAlt]           = useState('')

  // Spec: CRUD de áreas — catálogo propio, independiente del alta de coordinador.
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState('')
  const [creandoArea, setCreandoArea]         = useState(false)
  const [errorArea, setErrorArea]             = useState('')

  // Spec: 3 conceptos separados por pestaña — Áreas, Coordinadores, Alternativos.
  const [tab, setTab] = useState<'areas' | 'coordinadores' | 'alternativos'>('areas')

  function cargar() {
    setCargando(true)
    Promise.all([
      fetch('/api/compras/coordinadores').then(r => r.json()),
      fetch('/api/compras/areas?todas=1').then(r => r.json()),
    ])
      .then(([coords, areasData]) => {
        setCoordinadores(Array.isArray(coords) ? coords : [])
        setAreas(Array.isArray(areasData) ? areasData : [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  const areasActivas = areas.filter(a => a.activo)

  async function handleCrearArea() {
    if (!nuevaAreaNombre.trim()) return
    setCreandoArea(true); setErrorArea('')
    const res = await fetch('/api/compras/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevaAreaNombre.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setNuevaAreaNombre(''); cargar() }
    else setErrorArea(data.error || 'Error al crear área')
    setCreandoArea(false)
  }

  async function handleToggleAreaActivo(a: AreaCatalogo) {
    const res = await fetch(`/api/compras/areas/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !a.activo }),
    })
    const data = await res.json()
    if (data.success) cargar()
    else alert(data.error || 'Error al actualizar área')
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    if (!areaAltSel) { setAltList([]); return }
    setCargandoAlt(true)
    fetch(`/api/compras/areas/${areaAltSel}/alternativos`)
      .then(r => r.json())
      .then(data => setAltList(Array.isArray(data?.alternativos) ? data.alternativos : []))
      .catch(() => setAltList([]))
      .finally(() => setCargandoAlt(false))
  }, [areaAltSel])

  async function handleCrear() {
    if (!nuevoForm.area_id || !nuevoForm.nombre || !nuevoForm.email) {
      setErrorNuevo('Todos los campos son requeridos'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/compras/coordinadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area_id: nuevoForm.area_id,
        nombre:  nuevoForm.nombre,
        email:   nuevoForm.email,
      }),
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
    setEditForm({ area_id: c.area_id ?? '', nombre: c.nombre, email: c.email })
    setErrorEdit('')
    setEliminandoId(null)
    setErrorEliminar(null)
  }

  async function guardarPut(id: string, payload: Partial<{ area_id: string; nombre: string; email: string; activo: boolean }>) {
    return fetch(`/api/compras/coordinadores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json())
  }

  async function handleGuardarEdit() {
    if (!editForm.area_id || !editForm.nombre || !editForm.email) {
      setErrorEdit('Todos los campos son requeridos'); return
    }
    setGuardandoEdit(true); setErrorEdit('')
    const data = await guardarPut(editandoId!, editForm)
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  // Spec: SC-002 CA-10 — desactivar/activar no requiere el chequeo de
  // dependencias que sí exige el DELETE físico.
  async function handleToggleActivo(c: Coordinador) {
    if (!c.area_id) return
    const data = await guardarPut(c.id, { area_id: c.area_id, nombre: c.nombre, email: c.email, activo: !c.activo })
    if (data.success) cargar()
    else alert(data.error || 'Error al actualizar')
  }

  async function handleEliminar(id: string) {
    const res  = await fetch(`/api/compras/coordinadores/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      setEliminandoId(null); setErrorEliminar(null); cargar()
    } else if (res.status === 409) {
      setErrorEliminar({ id, motivos: data.motivos ?? [] })
    } else {
      alert(data.error || 'Error al eliminar')
    }
  }

  async function handleAgregarAlternativo() {
    if (!nuevoAltId) return
    setErrorAlt('')
    const res = await fetch(`/api/compras/areas/${areaAltSel}/alternativos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinador_id: nuevoAltId }),
    })
    const data = await res.json()
    if (res.ok) {
      setNuevoAltId('')
      fetch(`/api/compras/areas/${areaAltSel}/alternativos`).then(r => r.json()).then(data => setAltList(data?.alternativos ?? []))
    } else {
      setErrorAlt(data.error || 'Error al agregar')
    }
  }

  async function handleQuitarAlternativo(coordinadorId: string) {
    await fetch(`/api/compras/areas/${areaAltSel}/alternativos?coordinador_id=${coordinadorId}`, { method: 'DELETE' })
    fetch(`/api/compras/areas/${areaAltSel}/alternativos`).then(r => r.json()).then(data => setAltList(data?.alternativos ?? []))
  }

  const nombreArea = (id: string | null) => areas.find(a => a.id === id)?.nombre ?? '—'

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Áreas</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Áreas de la empresa, sus coordinadores y aprobadores alternativos
            </p>
          </div>
          {tab === 'coordinadores' && (
            <div className="flex gap-2">
              <a href="/api/exportar/coordinadores" download>
                <Button variant="outline" className="text-sm">⬇ Excel</Button>
              </a>
              <Button onClick={() => { setShowNuevo(true); setErrorNuevo(''); setNuevoForm(FORM_VACIO) }}
                className="btn-primary text-sm">
                + Nuevo Coordinador
              </Button>
            </div>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1">
          {([
            { id: 'areas' as const, label: 'Áreas' },
            { id: 'coordinadores' as const, label: 'Coordinadores' },
            { id: 'alternativos' as const, label: 'Alternativos' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                tab === t.id
                  ? 'bg-[#1a5252] text-white border-[#1a5252]'
                  : 'bg-white text-slate-500 border-slate-300 hover:border-teal-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Catálogo de Áreas — CRUD propio, independiente del alta de coordinador */}
        {tab === 'areas' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Áreas</CardTitle>
            <p className="text-slate-500 text-xs mt-0.5">
              Catálogo de áreas de la empresa. Desactivar una área no la elimina — solo deja de ofrecerse en Nueva NP y en las selecciones de coordinador.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {areas.length === 0 ? (
              <p className="text-slate-400 text-sm">No hay áreas registradas.</p>
            ) : (
              <ul className="space-y-1">
                {areas.map(a => (
                  <li key={a.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-1.5 bg-slate-50">
                    <span className={a.activo ? '' : 'text-slate-400'}>{a.nombre}</span>
                    <button onClick={() => handleToggleAreaActivo(a)}
                      className={`text-xs px-2 py-0.5 rounded-full border ${a.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                      title="Clic para activar/desactivar">
                      {a.activo ? 'Activa' : 'Inactiva'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 items-end pt-2 border-t">
              <div className="flex-1">
                <Label className="text-xs">Nueva área</Label>
                <Input value={nuevaAreaNombre} onChange={e => setNuevaAreaNombre(e.target.value)}
                  className="mt-1 h-8 text-sm" placeholder="Nombre del área" />
              </div>
              <Button onClick={handleCrearArea} disabled={!nuevaAreaNombre.trim() || creandoArea}
                className="btn-primary h-8 text-xs px-3">
                {creandoArea ? 'Creando...' : 'Crear'}
              </Button>
            </div>
            {errorArea && <p className="text-red-600 text-xs">{errorArea}</p>}
          </CardContent>
        </Card>
        )}

        {tab === 'coordinadores' && (<>
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
                  <select value={nuevoForm.area_id} onChange={e => setNuevoForm(f => ({ ...f, area_id: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-8">
                    <option value="">Selecciona...</option>
                    {areasActivas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">¿No está en la lista? Créala primero en "Áreas" más arriba.</p>
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
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="btn-primary">
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
                      <th className="text-left py-3 pr-4 w-20">Estado</th>
                      <th className="text-left py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coordinadores.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        {editandoId === c.id ? (
                          <td colSpan={5} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                              <div>
                                <Label className="text-xs">Área</Label>
                                <select value={editForm.area_id} onChange={e => setEditForm(f => ({ ...f, area_id: e.target.value }))}
                                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-8">
                                  <option value="">Selecciona...</option>
                                  {areasActivas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                  {editForm.area_id && !areasActivas.some(a => a.id === editForm.area_id) && (
                                    <option value={editForm.area_id}>{nombreArea(editForm.area_id)} (inactiva)</option>
                                  )}
                                </select>
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
                                className="h-7 text-xs btn-primary px-3">
                                {guardandoEdit ? 'Guardando...' : 'Guardar'}
                              </Button>
                              <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 pr-4 font-medium text-slate-800">{nombreArea(c.area_id) !== '—' ? nombreArea(c.area_id) : c.area}</td>
                            <td className="py-3 pr-4 text-slate-700">{c.nombre}</td>
                            <td className="py-3 pr-4 text-slate-500 text-xs">{c.email}</td>
                            <td className="py-3 pr-4">
                              <button onClick={() => handleToggleActivo(c)}
                                className={`text-xs px-2 py-0.5 rounded-full border ${c.activo !== false ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                                title="Clic para activar/desactivar">
                                {c.activo !== false ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="py-3">
                              <div className="flex flex-col gap-1">
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
                                      <button onClick={() => { setEliminandoId(null); setErrorEliminar(null) }}
                                        className="text-xs text-slate-400 hover:underline">
                                        / Cancelar
                                      </button>
                                    </span>
                                  ) : (
                                    <button onClick={() => { setEliminandoId(c.id); setEditandoId(null); setErrorEliminar(null) }}
                                      className="text-xs text-red-400 hover:text-red-600 hover:underline">
                                      Eliminar
                                    </button>
                                  )}
                                </div>
                                {errorEliminar?.id === c.id && (
                                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-xs">
                                    No se puede eliminar — tiene dependencias activas:
                                    <ul className="list-disc list-inside">
                                      {errorEliminar.motivos.map((m, i) => <li key={i}>{m}</li>)}
                                    </ul>
                                    Usa "Inactivo" en su lugar.
                                  </div>
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
        </>)}

        {/* Spec: SC-002 CA-04/CA-09 — Aprobadores alternativos por área */}
        {tab === 'alternativos' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Aprobadores Alternativos por Área</CardTitle>
            <p className="text-slate-500 text-xs mt-0.5">
              Para casos donde una NP de un área debe poder aprobarla alguien distinto del coordinador natural.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Área</Label>
              <select value={areaAltSel} onChange={e => setAreaAltSel(e.target.value)}
                className="mt-1 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm h-8">
                <option value="">Selecciona un área...</option>
                {areasActivas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>

            {areaAltSel && (
              <>
                {cargandoAlt ? (
                  <p className="text-slate-400 text-sm">Cargando...</p>
                ) : altList.length === 0 ? (
                  <p className="text-slate-400 text-sm">Esta área no tiene aprobadores alternativos configurados — el formulario de NP no mostrará selector de aprobador para ella.</p>
                ) : (
                  <ul className="space-y-1">
                    {altList.map(alt => (
                      <li key={alt.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-1.5 bg-slate-50">
                        <span>
                          {alt.coordinadores_area?.nombre ?? '—'}
                          <span className="text-xs text-slate-400 ml-2">{alt.coordinadores_area?.email}</span>
                          {alt.coordinadores_area?.activo === false && (
                            <span className="text-xs text-amber-600 ml-2">(coordinador inactivo)</span>
                          )}
                        </span>
                        <button onClick={() => handleQuitarAlternativo(alt.coordinador_id)}
                          className="text-xs text-red-400 hover:text-red-600 hover:underline">
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2 items-end pt-2 border-t">
                  <div className="flex-1">
                    <Label className="text-xs">Agregar coordinador como alternativo</Label>
                    <select value={nuevoAltId} onChange={e => setNuevoAltId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-8">
                      <option value="">Selecciona un coordinador...</option>
                      {coordinadores
                        .filter(c => !altList.some(a => a.coordinador_id === c.id))
                        .map(c => <option key={c.id} value={c.id}>{c.nombre} — {nombreArea(c.area_id)}</option>)}
                    </select>
                  </div>
                  <Button onClick={handleAgregarAlternativo} disabled={!nuevoAltId} className="btn-primary h-8 text-xs px-3">
                    Agregar
                  </Button>
                </div>
                {errorAlt && <p className="text-red-600 text-xs">{errorAlt}</p>}
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}
