'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { Rol } from '@/lib/nav-config'
import { vistasMisNPsVisibles } from '@/lib/vistas-mis-nps'

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
  asignado_a:       string | null
  asignado_nombre:  string | null
  asignado_email:   string | null
  origen?:          'propia' | 'asignada' | null
  es_regularizacion: boolean
  creado_por_id?:   string | null
}

type Asistente = { id: string; nombre: string; email: string }

const ESTADO_BADGE: Record<string, string> = {
  borrador:         'bg-slate-100 text-slate-500',
  pendiente:        'bg-yellow-100 text-yellow-800',
  aprobada:         'bg-green-100 text-green-800',
  rechazada:        'bg-red-100 text-red-800',
  devuelta:         'bg-amber-100 text-amber-800',
  convertida:       'bg-blue-100 text-blue-800',
  en_gestion:       'bg-cyan-100 text-cyan-800',
  oc_directa:       'bg-orange-100 text-orange-800',
  oc_generada:      'bg-indigo-100 text-indigo-800',
  oc_en_aprobacion: 'bg-purple-100 text-purple-800',
  oc_aprobada:      'bg-teal-100 text-teal-800',
  // Spec: HU-019 — cobertura vía OCA (100% u mixta con OC)
  oca_generada:     'bg-fuchsia-100 text-fuchsia-800',
  oca_oc_generada:  'bg-pink-100 text-pink-800',
  completada:       'bg-teal-100 text-teal-800',
  cancelada:        'bg-gray-100 text-gray-600',
}

// Spec: HU-009 — notas_pedido.estado ya no es solo el conjunto original; se
// muestran con etiqueta legible en vez del valor crudo (evita "en_gestion" literal).
const ESTADO_LABEL: Record<string, string> = {
  borrador:         'Borrador',
  pendiente:        'En aprobación',
  aprobada:         'Aprobada',
  rechazada:        'Rechazada',
  devuelta:         'Devuelta',
  en_gestion:       'En gestión',
  oc_directa:       'OC directa',
  oc_generada:      'OC generada',
  oc_en_aprobacion: 'OC en aprobación',
  oc_aprobada:      'OC aprobada',
  // Spec: HU-019 CA-06/CA-09 — 100% OCA / mezcla OC+OCA
  oca_generada:     'OCA generada',
  oca_oc_generada:  'OC + OCA generadas',
  completada:       'Completada',
  cancelada:        'Cancelada',
}

// Spec: HU-010 — espejo de ESTADOS_NP_ABIERTA_A_OC (lib/np-estado.ts). No se importa
// directamente porque este archivo es 'use client' y ese módulo toca adminClient()
// (service-role key), igual que el patrón ya usado en app/compras/[id]/page.tsx.
const ESTADOS_NP_ABIERTA_A_OC = ['aprobada', 'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada']

const PRIORIDAD_BADGE: Record<string, string> = {
  excepcional: 'bg-red-100 text-red-800',
  alta:        'bg-orange-100 text-orange-800',
  media:       'bg-blue-100 text-blue-800',
  baja:        'bg-slate-100 text-slate-600',
}

const ESTADOS = [
  'todos', 'borrador', 'pendiente', 'aprobada', 'rechazada', 'devuelta',
  'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada',
  'oca_generada', 'oca_oc_generada', 'cancelada',
]

// Spec: SC-009-v2.md CA-01/CA-09 — panel "Vistas", compartido entre el aside
// de desktop y el overlay de mobile (mismo contenido, distinto contenedor).
function renderVistas(rol: Rol, userId: string, npsBase: NP[], searchParams: URLSearchParams, onNavegar?: () => void) {
  return (
    <nav className="space-y-1">
      {vistasMisNPsVisibles({ id: userId, rol }).map(v => {
        const activa = v.esActiva(searchParams)
        return (
          <Link
            key={v.label}
            href={v.construirHref({ id: userId, rol })}
            onClick={onNavegar}
            className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              activa ? 'bg-[#1a5252]/10 text-[#1a5252] font-semibold' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{v.label}</span>
            <span className={`text-xs rounded-full px-2 py-0.5 ${activa ? 'bg-[#1a5252] text-white' : 'bg-slate-100 text-slate-500'}`}>
              {v.contar(npsBase)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function ComprasPage() {
  // Spec: SC-008-v3.md — "Vistas guardadas" de Inicio llegan con ?estado=
  // en la URL; se usa como valor inicial del filtro sin cambiar el
  // comportamiento por defecto (sin query string, arranca en 'todos' igual que hoy).
  const searchParams = useSearchParams()
  const [nps, setNps]           = useState<NP[]>([])
  const [npsBase, setNpsBase]   = useState<NP[]>([])
  const [filtrosAbiertos, setFiltrosAbiertos]       = useState(false)
  const [vistasMobileAbiertas, setVistasMobileAbiertas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [q, setQ]               = useState('')
  const [estado, setEstado]     = useState('todos')
  const [area, setArea]         = useState('todas')
  const [areas, setAreas]       = useState<{ id: string; nombre: string }[]>([])
  // Spec: SC-010-v2.md CA-01/CA-02/CA-03 — filtros client-side sobre el
  // baseline ya cargado por `cargar()`, sin ningún query param nuevo de
  // backend (RN-05).
  const [prioridadFiltro, setPrioridadFiltro] = useState('todas')
  const [compradorFiltro, setCompradorFiltro] = useState('todos')
  const [fechaDesde, setFechaDesde]           = useState('')
  const [fechaHasta, setFechaHasta]           = useState('')
  const [rol, setRol]           = useState('')
  const [puedeCrearNP, setPuedeCrearNP] = useState(false)
  // Spec: HU-009 CA-15 — necesario para mostrar "Enviar a aprobación" solo en los propios borradores
  const [userId, setUserId]     = useState('')
  const [enviandoId, setEnviandoId] = useState<string | null>(null)

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
      setUserId(user.id)
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

  // Spec: SC-009-v2.md CA-09 — un click en "Vistas" de esta misma pantalla
  // (ej. desde la tabla ya montada) no remonta el componente, solo cambia
  // el query string: sin este efecto, `estado` quedaría congelado en el
  // valor leído al montar y la vista clickeada no se aplicaría ni se
  // resaltaría. Mismo caso cuando se llega desde /compras/inicio (SC-008).
  useEffect(() => {
    setEstado(searchParams.get('estado') ?? 'todos')
  }, [searchParams])

  // Spec: SC-009-v2.md RN-02 — baseline sin filtro, solo para los contadores
  // del panel "Vistas"; no sustituye a `cargar()` (que sigue aplicando los
  // filtros activos a la tabla).
  useEffect(() => {
    fetch('/api/compras/nps')
      .then(r => r.json())
      .then(data => setNpsBase(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Spec: SC-010-v2.md CA-01/CA-02/CA-03 — combina los 3 filtros nuevos sobre
  // `nps` (ya filtrado por estado/area/q en el backend); npsVisibles queda
  // igual a `nps` cuando los 3 están en su valor por defecto (regresión).
  const npsVisibles = nps.filter(np =>
    (prioridadFiltro === 'todas' || np.prioridad === prioridadFiltro) &&
    (compradorFiltro === 'todos' || np.asignado_a === compradorFiltro) &&
    (!fechaDesde || np.created_at >= fechaDesde) &&
    (!fechaHasta || np.created_at <= `${fechaHasta}T23:59:59`)
  )

  // Spec: SC-010-v2.md Decisión 6 — derivado de npsBase (facetado, mismo
  // patrón de HU-013 proveedoresDisponibles), no de /api/compras/asistentes
  // (restringido a compras/admin, 403 para el resto de los 8 roles).
  const compradoresDisponibles = Array.from(
    new Map(
      npsBase
        .filter(np => np.asignado_a)
        .map(np => [np.asignado_a as string, np.asignado_nombre ?? np.asignado_a as string])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

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

  // Spec: HU-009 CA-15
  async function handleEnviarBorrador(np: NP) {
    setEnviandoId(np.id)
    const res = await fetch(`/api/compras/nps/${np.id}/enviar-aprobacion`, { method: 'POST' })
    const data = await res.json()
    setEnviandoId(null)
    if (!res.ok) { alert(data.error ?? 'Error al enviar la NP'); return }
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
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
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

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Vistas — acceso rápido (CA-01/CA-09) */}
          {rol && (
            <>
              <button
                onClick={() => setVistasMobileAbiertas(true)}
                className="lg:hidden flex items-center gap-2 text-sm font-medium text-slate-600 px-3 py-2 rounded-md border border-slate-200 bg-white w-fit"
              >
                ☰ Vistas
              </button>

              {vistasMobileAbiertas && (
                <div
                  className="lg:hidden fixed inset-0 z-[90] bg-black/40"
                  onClick={() => setVistasMobileAbiertas(false)}
                >
                  <aside
                    onClick={e => e.stopPropagation()}
                    className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl overflow-y-auto p-3"
                  >
                    {renderVistas(rol as Rol, userId, npsBase, searchParams, () => setVistasMobileAbiertas(false))}
                  </aside>
                </div>
              )}

              <aside className="hidden lg:block lg:w-56 shrink-0">
                <Card>
                  <CardContent className="p-2">
                    {renderVistas(rol as Rol, userId, npsBase, searchParams)}
                  </CardContent>
                </Card>
              </aside>
            </>
          )}

          {/* Columna central */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar número o solicitante..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm flex-1"
              />
              <Button onClick={cargar} className="h-9 btn-primary shrink-0">Buscar</Button>
              <Button
                variant="outline"
                onClick={() => setFiltrosAbiertos(o => !o)}
                className="h-9 text-sm shrink-0"
              >
                Filtros {filtrosAbiertos ? '▲' : '▼'}
              </Button>
            </div>

            {filtrosAbiertos && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={estado}
                      onChange={e => setEstado(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {ESTADOS.map(e => (
                        <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : (ESTADO_LABEL[e] ?? e)}</option>
                      ))}
                    </select>
                    <select
                      value={area}
                      onChange={e => setArea(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="todas">Todas las áreas</option>
                      {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                    </select>
                    {/* Spec: SC-010-v2.md CA-01 */}
                    <select
                      value={prioridadFiltro}
                      onChange={e => setPrioridadFiltro(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="todas">Todas las prioridades</option>
                      {Object.keys(PRIORIDAD_BADGE).map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                    {/* Spec: SC-010-v2.md CA-02 */}
                    <select
                      value={compradorFiltro}
                      onChange={e => setCompradorFiltro(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="todos">Todos los compradores</option>
                      {compradoresDisponibles.map(([id, nombre]) => (
                        <option key={id} value={id}>{nombre}</option>
                      ))}
                    </select>
                    {/* Spec: SC-010-v2.md CA-03 — rango desde/hasta */}
                    <div className="flex gap-2 items-center">
                      <Input
                        type="date"
                        value={fechaDesde}
                        onChange={e => setFechaDesde(e.target.value)}
                        className="h-9 text-sm"
                        aria-label="Fecha de creación desde"
                      />
                      <span className="text-slate-400 text-xs shrink-0">a</span>
                      <Input
                        type="date"
                        value={fechaHasta}
                        onChange={e => setFechaHasta(e.target.value)}
                        className="h-9 text-sm"
                        aria-label="Fecha de creación hasta"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabla */}
            <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${npsVisibles.length} registros`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : npsVisibles.length === 0 ? (
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
                      <th className="text-left py-3"></th>
                      {esCompras && <th className="text-left py-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {npsVisibles.map(np => (
                      <tr key={np.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/compras/${np.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                              {np.numero}
                            </Link>
                            {np.es_regularizacion && (
                              <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                REG
                              </span>
                            )}
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[np.estado] ?? ''}`}>
                            {ESTADO_LABEL[np.estado] ?? np.estado}
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
                              : np.origen === 'propia'
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Propia</span>
                              : <span className="text-xs text-slate-400">—</span>}
                          </td>
                        )}

                        <td className="py-3 pr-4 text-slate-500 text-xs">
                          {new Date(np.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>

                        {/* Spec: HU-009 CA-15 — Enviar a aprobación, solo visible para el creador del borrador */}
                        <td className="py-3">
                          {np.estado === 'borrador' && np.creado_por_id === userId && (
                            <button
                              onClick={() => handleEnviarBorrador(np)}
                              disabled={enviandoId === np.id}
                              className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              {enviandoId === np.id ? 'Enviando...' : 'Enviar a aprobación'}
                            </button>
                          )}
                        </td>

                        {/* Botón Asignar para Compras */}
                        {esCompras && (
                          <td className="py-3">
                            {/* Spec: HU-010 — antes solo 'aprobada'; una NP con comprador ya
                                asignado deja ese Estado de inmediato (HU-009) y el botón
                                desaparecía, bloqueando reasignar/quitar asignación. */}
                            {ESTADOS_NP_ABIERTA_A_OC.includes(np.estado) && !np.convertida && (
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
        </div>
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
