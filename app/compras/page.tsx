'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type NP = {
  id: string
  numero: string
  solicitante_nombre: string
  solicitante_email: string
  area: string
  prioridad: string
  tipo_compra: string
  descripcion_general: string | null
  estado: string
  total_estimado: number
  convertida: boolean
  created_at: string
  asignado_a:      string | null
  asignado_nombre: string | null
  asignado_email:  string | null
  origen?: 'propia' | 'asignada'
}

type Asistente = { id: string; nombre: string; email: string }

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  aprobada:   'bg-green-100 text-green-800',
  rechazada:  'bg-red-100 text-red-800',
  devuelta:   'bg-amber-100 text-amber-800',
  convertida: 'bg-blue-100 text-blue-800',
}

const PRIORIDAD_BADGE: Record<string, string> = {
  excepcional: 'bg-red-100 text-red-800',
  alta:        'bg-orange-100 text-orange-800',
  media:       'bg-blue-100 text-blue-800',
  baja:        'bg-slate-100 text-slate-600',
}

const ESTADOS = ['todos', 'pendiente', 'aprobada', 'rechazada', 'devuelta']

export default function ComprasPage() {
  const [nps, setNps]           = useState<NP[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ]               = useState('')
  const [estado, setEstado]     = useState('todos')
  const [area, setArea]         = useState('todas')
  const [areas, setAreas]       = useState<string[]>([])
  const [rol, setRol]           = useState('')
  const [puedeCrearNP, setPuedeCrearNP] = useState(false)

  // Modal asignar
  const [modalAsignar, setModalAsignar]     = useState(false)
  const [npAsignar, setNpAsignar]           = useState<NP | null>(null)
  const [asistentes, setAsistentes]         = useState<Asistente[]>([])
  const [asistenteSelec, setAsistenteSelec] = useState('')
  const [asignando, setAsignando]           = useState(false)
  const [errorAsignar, setErrorAsignar]     = useState('')

  useEffect(() => {
    fetch('/api/compras/areas').then(r => r.json()).then(setAreas).catch(console.error)

    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch('/api/auth/perfil')
        .then(r => r.json())
        .then(p => {
          setRol(p.rol ?? '')
          if (['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'asistente_compras', 'coordinador'].includes(p.rol))
            setPuedeCrearNP(true)
          if (['compras', 'admin'].includes(p.rol))
            fetch('/api/compras/asistentes').then(r => r.json()).then(setAsistentes).catch(console.error)
        })
    })
  }, [])

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (estado !== 'todos') params.set('estado', estado)
    if (area   !== 'todas') params.set('area', area)
    if (q.trim())           params.set('q', q.trim())

    fetch(`/api/compras/nps?${params}`)
      .then(r => r.json())
      .then(data => { setNps(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [estado, area, q])

  useEffect(() => { cargar() }, [cargar])

  function abrirAsignar(np: NP) {
    setNpAsignar(np)
    setAsistenteSelec(np.asignado_a ?? '')
    setErrorAsignar('')
    setModalAsignar(true)
  }

  async function handleAsignar() {
    if (!npAsignar || !asistenteSelec) return
    setAsignando(true)
    setErrorAsignar('')
    const accion = npAsignar.asignado_a ? 'reasignar' : 'asignar'
    const res = await fetch(`/api/compras/nps/${npAsignar.id}/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, asistente_id: asistenteSelec }),
    })
    const data = await res.json()
    setAsignando(false)
    if (!res.ok) { setErrorAsignar(data.error ?? 'Error'); return }
    setModalAsignar(false)
    cargar()
  }

  async function handleQuitarAsignacion() {
    if (!npAsignar) return
    setAsignando(true)
    setErrorAsignar('')
    const res = await fetch(`/api/compras/nps/${npAsignar.id}/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'tomar_control' }),
    })
    const data = await res.json()
    setAsignando(false)
    if (!res.ok) { setErrorAsignar(data.error ?? 'Error'); return }
    setModalAsignar(false)
    cargar()
  }

  const esCompras      = ['compras', 'admin'].includes(rol)
  const esAsistente    = rol === 'asistente_compras'
  const esSolicitante  = rol === 'solicitante'
  const puedeVerPrecio = ['compras', 'admin', 'asistente_compras'].includes(rol)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              {esSolicitante ? 'Mis Notas de Pedido' : esAsistente ? 'Mis NPs' : 'Notas de Pedido'}
            </h1>
            <p className="text-blue-300 text-xs mt-0.5">Listado y gestión de requerimientos</p>
          </div>
          <div className="flex gap-2">
            <a href="/api/exportar/nps" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Excel</Button>
            </a>
            {puedeCrearNP && (
              <Link href="/compras/nueva">
                <Button className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">+ Nueva NP</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Buscar número o solicitante..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
              <select
                value={area}
                onChange={e => setArea(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todas">Todas las áreas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <Button onClick={cargar} className="h-9 btn-primary">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${nps.length} registros`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : nps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay registros con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Número</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4">Tipo</th>
                      {puedeVerPrecio && <th className="text-right py-3 pr-4">Total Est.</th>}
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">OC</th>
                      {esCompras  && <th className="text-left py-3 pr-4">Asignada a</th>}
                      {esAsistente && <th className="text-left py-3 pr-4">Origen</th>}
                      <th className="text-left py-3">Fecha</th>
                      {esCompras && <th className="text-left py-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {nps.map(np => (
                      <tr key={np.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/compras/${np.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                              {np.numero}
                            </Link>
                            {np.descripcion_general && (
                              <span title={np.descripcion_general} className="text-slate-400 text-xs cursor-help" aria-label="Descripción general">
                                ℹ️
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{np.solicitante_nombre}</div>
                          <div className="text-xs text-slate-400">{np.solicitante_email}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">{np.area}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORIDAD_BADGE[np.prioridad] ?? ''}`}>
                            {np.prioridad}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600 text-xs capitalize">{np.tipo_compra}</td>
                        {puedeVerPrecio && <td className="py-3 pr-4 text-right font-medium">{np.total_estimado != null ? `$${Number(np.total_estimado).toFixed(2)}` : '—'}</td>}
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_BADGE[np.estado] ?? ''}`}>
                            {np.estado}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {np.convertida
                            ? <span className="text-xs text-blue-600 font-medium">✓ Convertida</span>
                            : <span className="text-xs text-slate-400">—</span>}
                        </td>

                        {/* Columna asignación para Compras */}
                        {esCompras && (
                          <td className="py-3 pr-4">
                            {np.asignado_nombre
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                                  👤 {np.asignado_nombre}
                                </span>
                              : <span className="text-xs text-slate-400">—</span>}
                          </td>
                        )}

                        {/* Columna origen para Asistente */}
                        {esAsistente && (
                          <td className="py-3 pr-4">
                            {np.origen === 'asignada'
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">Asignada</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Propia</span>}
                          </td>
                        )}

                        <td className="py-3 pr-4 text-slate-500 text-xs">
                          {new Date(np.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>

                        {/* Botón Asignar para Compras */}
                        {esCompras && (
                          <td className="py-3">
                            {np.estado === 'aprobada' && !np.convertida && (
                              <button
                                onClick={() => abrirAsignar(np)}
                                className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap"
                              >
                                {np.asignado_a ? 'Reasignar' : 'Asignar'}
                              </button>
                            )}
                          </td>
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

      {/* Modal asignar */}
      {modalAsignar && npAsignar && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalAsignar(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
              <h2 className="text-white font-semibold text-base">
                {npAsignar.asignado_a ? 'Reasignar NP' : 'Asignar NP'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(201,168,64,0.9)' }}>{npAsignar.numero} — {npAsignar.area}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {npAsignar.asignado_a && (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-500">
                    Asignada a <span className="font-semibold text-slate-700">{npAsignar.asignado_nombre}</span>
                  </span>
                  <button
                    onClick={handleQuitarAsignacion}
                    disabled={asignando}
                    className="text-xs text-red-600 hover:text-red-800 font-medium underline underline-offset-2 disabled:opacity-50 shrink-0 ml-3"
                  >
                    Quitar asignación
                  </button>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Asistente de Compras</label>
                <select
                  value={asistenteSelec}
                  onChange={e => setAsistenteSelec(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                >
                  <option value="">— Seleccionar asistente —</option>
                  {asistentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
                  ))}
                </select>
              </div>
              {errorAsignar && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{errorAsignar}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setModalAsignar(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAsignar}
                  disabled={asignando || !asistenteSelec}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: '#1a5252' }}
                >
                  {asignando ? 'Asignando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
