'use client'

export const dynamic = 'force-dynamic'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Rol } from '@/lib/nav-config'
import { vistasVistaNPVisibles } from '@/lib/vistas-vista-np'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AccionCatalogo = { id: string; orden: number; descripcion: string }

type OcDeLinea = { id: string; numero_oc: string }

type Linea = {
  id: string
  linea: number
  descripcion: string
  cantidad: number
  precio_unitario: number | null
  accion: AccionCatalogo | null
  oc: OcDeLinea | null
}

type SlaBadge = 'no_activo' | 'pausado' | 'a_tiempo' | 'vencido'

type FilaVistaNP = {
  id: string
  numero: string
  created_at: string
  area: string
  solicitante_nombre: string
  descripcion_general: string | null
  prioridad: 'excepcional' | 'alta' | 'media' | 'baja'
  estado: string
  asignado_a: string | null
  asignado_nombre: string | null
  total_estimado: number | null
  sla_badge: SlaBadge
  accion_agregada: AccionCatalogo | null
  lineas: Linea[]
}

type Comprador = { id: string; nombre: string }
type Perfil = { id: string; nombre: string; rol: string; email: string }

// ─── Constantes visuales (espejo de app/compras/page.tsx, mismo criterio ya
// establecido de duplicar mapas pequeños en cada 'use client' en vez de
// importarlos de un módulo que toca adminClient()) ────────────────────────────

const ESTADO_BADGE: Record<string, string> = {
  borrador:         'bg-slate-100 text-slate-500',
  pendiente:        'bg-yellow-100 text-yellow-800',
  aprobada:         'bg-green-100 text-green-800',
  rechazada:        'bg-red-100 text-red-800',
  devuelta:         'bg-amber-100 text-amber-800',
  en_gestion:       'bg-cyan-100 text-cyan-800',
  oc_directa:       'bg-orange-100 text-orange-800',
  oc_generada:      'bg-indigo-100 text-indigo-800',
  oc_en_aprobacion: 'bg-purple-100 text-purple-800',
  oc_aprobada:      'bg-teal-100 text-teal-800',
  // Spec: HU-019 — cobertura vía OCA (100% u mixta con OC)
  oca_generada:     'bg-fuchsia-100 text-fuchsia-800',
  oca_oc_generada:  'bg-pink-100 text-pink-800',
  completada:       'bg-teal-100 text-teal-800',
}

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
  oca_generada:     'OCA generada',
  oca_oc_generada:  'OC + OCA generadas',
  completada:       'Completada',
}

const ESTADOS = [
  'todos', 'borrador', 'pendiente', 'aprobada', 'rechazada', 'devuelta',
  'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada',
  'oca_generada', 'oca_oc_generada', 'completada',
]

const PRIORIDAD_LABEL: Record<string, string> = {
  excepcional: 'Excepcional', alta: 'Alta', media: 'Media', baja: 'Baja',
}
const PRIORIDAD_DOT: Record<string, string> = {
  excepcional: 'bg-red-600', alta: 'bg-orange-500', media: 'bg-blue-500', baja: 'bg-slate-400',
}

const SLA_LABEL: Record<SlaBadge, string> = {
  no_activo: 'No activo', pausado: 'Pausado', a_tiempo: 'A tiempo', vencido: 'Vencido',
}
const SLA_BADGE_CLASS: Record<SlaBadge, string> = {
  no_activo: 'bg-slate-100 text-slate-500',
  pausado:   'bg-blue-100 text-blue-700',
  a_tiempo:  'bg-green-100 text-green-700',
  vencido:   'bg-red-100 text-red-700',
}

// Spec CA-01: comprador oculto en estos Estados (aún no tiene sentido asignarlo)
const ESTADOS_SIN_COMPRADOR = ['borrador', 'pendiente']

function usd(n: number) {
  return `$${Number(n).toFixed(2)}`
}

type Filtros = {
  area: string; estado: string; accion: string; prioridad: string; sla: string
  comprador: string; solicitante: string; numero: string; descripcion: string
}

// Spec: HU-012 CA-03 — compartido entre la carga de la tabla y el botón de
// exportación, para que el Excel refleje exactamente los mismos filtros activos.
function construirQueryParams(filtros: Filtros): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.area !== 'todas') params.set('area', filtros.area)
  if (filtros.estado !== 'todos') params.set('estado', filtros.estado)
  if (filtros.accion !== 'todas' && filtros.estado === 'en_gestion') params.set('accion', filtros.accion)
  if (filtros.prioridad !== 'todas') params.set('prioridad', filtros.prioridad)
  if (filtros.sla !== 'todos') params.set('sla', filtros.sla)
  if (filtros.comprador !== 'todos') params.set('comprador', filtros.comprador)
  if (filtros.solicitante) params.set('solicitante', filtros.solicitante)
  if (filtros.numero) params.set('numero', filtros.numero)
  if (filtros.descripcion) params.set('descripcion', filtros.descripcion)
  return params
}

// Spec: SC-009-v2.md CA-04/CA-09 — panel "Vistas", compartido entre el aside
// de desktop y el overlay de mobile (mismo contenido, distinto contenedor).
function renderVistas(rol: Rol, userId: string, filasBase: FilaVistaNP[], searchParams: URLSearchParams, onNavegar?: () => void) {
  return (
    <nav className="space-y-1">
      {vistasVistaNPVisibles({ id: userId, rol }).map(v => {
        const activa = v.esActiva(searchParams, userId)
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
              {v.contar(filasBase, userId)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function VistaPorNPPage() {
  const [perfil, setPerfil]         = useState<Perfil | null>(null)
  const [rows, setRows]             = useState<FilaVistaNP[]>([])
  const [filasBase, setFilasBase]   = useState<FilaVistaNP[]>([])
  const [filtrosAbiertos, setFiltrosAbiertos]       = useState(false)
  const [vistasMobileAbiertas, setVistasMobileAbiertas] = useState(false)
  const [compradores, setCompradores] = useState<Comprador[]>([])
  const [acciones, setAcciones]     = useState<AccionCatalogo[]>([])
  const [areas, setAreas]           = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando]     = useState(true)
  const [expandida, setExpandida]   = useState<string | null>(null)

  // Spec: SC-008-v3.md — "Vista guardada" Vencidas por SLA llega con ?sla=
  // en la URL; se usa como valor inicial sin cambiar el comportamiento por
  // defecto (sin query string, arranca en 'todos' igual que hoy).
  // Fix real (SC-010, encontrado en caja negra CP-SC-010-030): inicializar
  // estado/sla/comprador de forma perezosa leyendo searchParams directamente,
  // en vez de hardcodear 'todos' y depender solo del useEffect de sincronización
  // de abajo — sin esto, el primer cargar() (con filtros por defecto) corre en
  // paralelo con el cargar() posterior ya filtrado, y si el fetch sin filtrar
  // (payload más grande) resuelve después, pisa el resultado correcto con
  // datos sin filtrar. Afectaba tanto a deep-links como a la Vista nueva.
  const searchParams = useSearchParams()
  const [filtros, setFiltros] = useState(() => ({
    area: 'todas',
    estado: searchParams.get('estado') ?? 'todos',
    accion: 'todas',
    prioridad: 'todas',
    sla: searchParams.get('sla') ?? 'todos',
    comprador: searchParams.get('comprador') ?? 'todos',
    solicitante: '', numero: '', descripcion: '',
  }))

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPerfil(d) })
      .catch(() => {})
    fetch('/api/compras/areas').then(r => r.json()).then(setAreas).catch(() => {})
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    const params = construirQueryParams(filtros)

    try {
      const res = await fetch(`/api/compras/nps/vista?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows ?? [])
        setCompradores(data.compradoresDisponibles ?? [])
        setAcciones(data.accionesCatalogo ?? [])
      }
    } finally {
      setCargando(false)
    }
  }, [filtros])

  useEffect(() => { cargar() }, [cargar])

  // Spec: SC-009-v2.md CA-09 — un click en "Vistas" de esta misma pantalla no
  // remonta el componente, solo cambia el query string: sin este efecto, los
  // filtros estado/sla quedarían congelados en el valor leído al montar.
  // Mismo caso cuando se llega desde /compras/inicio (SC-008).
  // Spec: SC-010 — comprador se agrega aquí (bug real encontrado en caja negra,
  // CP-SC-010-030: la Vista "En gestión (asignadas a mí)" cambiaba la URL y
  // resaltaba el acceso, pero nunca aplicaba el filtro real por comprador, ni
  // por self-link ni por deep-link, porque este efecto nunca leía ese param).
  useEffect(() => {
    const nuevoEstado = searchParams.get('estado') ?? 'todos'
    setFiltros(f => ({
      ...f,
      estado: nuevoEstado,
      sla: searchParams.get('sla') ?? 'todos',
      comprador: searchParams.get('comprador') ?? 'todos',
      accion: nuevoEstado === 'en_gestion' ? f.accion : 'todas',
    }))
  }, [searchParams])

  // Spec: SC-009-v2.md RN-02 — baseline sin filtro, solo para los contadores
  // del panel "Vistas"; no sustituye a `cargar()` (que sigue aplicando los
  // filtros activos a la tabla).
  useEffect(() => {
    fetch('/api/compras/nps/vista')
      .then(r => r.ok ? r.json() : null)
      .then(data => setFilasBase(data?.rows ?? []))
      .catch(() => {})
  }, [])

  const rol = perfil?.rol ?? ''
  // Spec CA-04: solo compras/admin reasignan comprador
  const puedeReasignarComprador = rol === 'compras' || rol === 'admin'

  function puedeMarcarAccion(fila: FilaVistaNP) {
    return rol === 'compras' || rol === 'admin' || (rol === 'asistente_compras' && fila.asignado_a === perfil?.id)
  }

  async function handleReasignar(fila: FilaVistaNP, asistenteId: string) {
    if (!asistenteId) return
    const accion = fila.asignado_a ? 'reasignar' : 'asignar'
    const res = await fetch(`/api/compras/nps/${fila.id}/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, asistente_id: asistenteId }),
    })
    if (res.ok) cargar()
  }

  async function handleMarcarAccion(fila: FilaVistaNP, itemNpId: string, accionId: string) {
    const nuevoAccionId = accionId === '' ? null : accionId
    const res = await fetch(`/api/compras/nps/${fila.id}/accion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion_id: nuevoAccionId, item_np_id: itemNpId }),
    })
    if (res.ok) cargar()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold">Vista por NP</h1>
            <p className="text-blue-300 text-xs mt-0.5">Estado, Prioridad, SLA y Acciones de gestión de todas las NPs</p>
          </div>
          {/* Spec: HU-012 CA-01 — deshabilitado si no hay datos visibles */}
          {rows.length > 0 ? (
            <a href={`/api/compras/nps/vista/excel?${construirQueryParams(filtros).toString()}`} download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">
                ⬇ Exportar a Excel
              </Button>
            </a>
          ) : (
            <Button variant="outline" disabled className="bg-transparent border-white/20 text-white/40 text-sm cursor-not-allowed">
              ⬇ Exportar a Excel
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Vistas — acceso rápido (CA-04/CA-09) */}
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
                    {renderVistas(rol as Rol, perfil?.id ?? '', filasBase, searchParams, () => setVistasMobileAbiertas(false))}
                  </aside>
                </div>
              )}

              <aside className="hidden lg:block lg:w-56 shrink-0">
                <Card>
                  <CardContent className="p-2">
                    {renderVistas(rol as Rol, perfil?.id ?? '', filasBase, searchParams)}
                  </CardContent>
                </Card>
              </aside>
            </>
          )}

          {/* Columna central */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setFiltrosAbiertos(o => !o)}
                className="h-9 text-sm"
              >
                Filtros {filtrosAbiertos ? '▲' : '▼'}
              </Button>
            </div>

            {filtrosAbiertos && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <select
                value={filtros.area}
                onChange={e => setFiltros(f => ({ ...f, area: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas las áreas</option>
                {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
              </select>

              <select
                value={filtros.estado}
                onChange={e => setFiltros(f => ({ ...f, estado: e.target.value, accion: 'todas' }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : (ESTADO_LABEL[e] ?? e)}</option>
                ))}
              </select>

              {/* Spec CA-02: Acción solo habilitado con Estado=en_gestion */}
              <select
                value={filtros.accion}
                disabled={filtros.estado !== 'en_gestion'}
                onChange={e => setFiltros(f => ({ ...f, accion: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="todas">Todas las Acciones</option>
                {acciones.map(a => <option key={a.id} value={a.id}>{a.descripcion}</option>)}
              </select>

              <select
                value={filtros.prioridad}
                onChange={e => setFiltros(f => ({ ...f, prioridad: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas las prioridades</option>
                {Object.entries(PRIORIDAD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>

              <select
                value={filtros.sla}
                onChange={e => setFiltros(f => ({ ...f, sla: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todos">Todos los SLA</option>
                {Object.entries(SLA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>

              <select
                value={filtros.comprador}
                onChange={e => setFiltros(f => ({ ...f, comprador: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todos">Todos los compradores</option>
                {/* Spec: SC-010 CA-05 — sentinel "sin comprador asignado" (asignado_a IS NULL) */}
                <option value="sin_asignar">Sin comprador asignado</option>
                {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>

              <Input
                placeholder="Solicitante..."
                value={filtros.solicitante}
                onChange={e => setFiltros(f => ({ ...f, solicitante: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <Input
                placeholder="N° NP..."
                value={filtros.numero}
                onChange={e => setFiltros(f => ({ ...f, numero: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Descripción..."
                value={filtros.descripcion}
                onChange={e => setFiltros(f => ({ ...f, descripcion: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <Button onClick={cargar} className="h-9 btn-primary">Buscar</Button>
            </div>
          </CardContent>
        </Card>
            )}

            {/* Tabla */}
            <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${rows.length} registros`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay registros con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-2 w-6" />
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4">Número</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-left py-3 pr-4">Comprador</th>
                      <th className="text-left py-3 pr-4">SLA</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">Acción</th>
                      <th className="text-right py-3 pr-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(fila => {
                      const esExcepcional = fila.prioridad === 'excepcional' && fila.estado === 'oc_directa'
                      const abierta = expandida === fila.id
                      return (
                        <Fragment key={fila.id}>
                          <tr
                            onClick={() => setExpandida(abierta ? null : fila.id)}
                            className={`border-b hover:bg-slate-50 cursor-pointer ${esExcepcional ? 'bg-red-50' : ''}`}
                          >
                            <td className="py-3 pr-2 text-slate-400">{abierta ? '▾' : '▸'}</td>
                            <td className="py-3 pr-4">
                              <span
                                className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORIDAD_DOT[fila.prioridad]} ${esExcepcional ? 'animate-pulse' : ''}`}
                                title={PRIORIDAD_LABEL[fila.prioridad]}
                              />
                            </td>
                            <td className="py-3 pr-4">
                              <Link href={`/compras/${fila.id}`} onClick={e => e.stopPropagation()} className="font-medium text-[#1a5252] hover:underline">
                                {fila.numero}
                              </Link>
                              <p className="text-xs text-slate-400">{new Date(fila.created_at).toLocaleDateString('es-EC')}</p>
                            </td>
                            <td className="py-3 pr-4">{fila.solicitante_nombre}</td>
                            <td className="py-3 pr-4 max-w-xs truncate" title={fila.descripcion_general ?? ''}>
                              {fila.descripcion_general ?? '—'}
                            </td>
                            <td className="py-3 pr-4" onClick={e => e.stopPropagation()}>
                              {ESTADOS_SIN_COMPRADOR.includes(fila.estado) ? (
                                <span className="text-slate-300">—</span>
                              ) : puedeReasignarComprador ? (
                                <select
                                  value={fila.asignado_a ?? ''}
                                  onChange={e => handleReasignar(fila, e.target.value)}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value="">Sin asignar</option>
                                  {/* El comprador asignado puede ya no estar en compradoresDisponibles
                                      (cuenta desactivada) — se agrega igual para que el <select>
                                      controlado no caiga en "Sin asignar" por no encontrar su value. */}
                                  {fila.asignado_a && !compradores.some(c => c.id === fila.asignado_a) && (
                                    <option value={fila.asignado_a}>{fila.asignado_nombre} (inactivo)</option>
                                  )}
                                  {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                              ) : (
                                <span>{fila.asignado_nombre ?? '—'}</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SLA_BADGE_CLASS[fila.sla_badge]}`}>
                                {SLA_LABEL[fila.sla_badge]}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[fila.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                                {ESTADO_LABEL[fila.estado] ?? fila.estado}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {fila.accion_agregada ? (
                                <div className="space-y-1 min-w-[120px]">
                                  <span className="text-xs text-slate-600">{fila.accion_agregada.descripcion}</span>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#1a5252]"
                                      style={{ width: `${acciones.length > 0 ? (fila.accion_agregada.orden / acciones.length) * 100 : 0}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right font-medium">
                              {fila.total_estimado !== null ? usd(fila.total_estimado) : '—'}
                            </td>
                          </tr>

                          {abierta && (
                            <tr key={`${fila.id}-detalle`} className="border-b bg-slate-50/60">
                              <td colSpan={10} className="px-6 py-4">
                                {esExcepcional && (
                                  <p className="text-xs font-semibold text-red-700 mb-3">
                                    ⚠ EMERGENCIA: OC directa sin proceso de cotización
                                  </p>
                                )}
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 uppercase border-b">
                                      <th className="text-left py-2 pr-3">Línea</th>
                                      <th className="text-left py-2 pr-3">Descripción</th>
                                      <th className="text-right py-2 pr-3">Cantidad</th>
                                      {fila.lineas.some(l => l.precio_unitario !== null) && (
                                        <th className="text-right py-2 pr-3">Precio Unit.</th>
                                      )}
                                      <th className="text-left py-2 pr-3">Acción</th>
                                      <th className="text-left py-2 pr-3">N° OC</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fila.lineas.map(linea => (
                                      <tr key={linea.id} className="border-b border-slate-100">
                                        <td className="py-2 pr-3">{linea.linea}</td>
                                        <td className="py-2 pr-3">{linea.descripcion}</td>
                                        <td className="py-2 pr-3 text-right">{linea.cantidad}</td>
                                        {fila.lineas.some(l => l.precio_unitario !== null) && (
                                          <td className="py-2 pr-3 text-right">
                                            {linea.precio_unitario !== null ? usd(linea.precio_unitario) : '—'}
                                          </td>
                                        )}
                                        <td className="py-2 pr-3">
                                          {/* Spec CA-05: sin Acciones cuando Estado=oc_directa */}
                                          {fila.estado === 'oc_directa' ? (
                                            <span className="text-slate-300">—</span>
                                          ) : fila.estado === 'en_gestion' && puedeMarcarAccion(fila) ? (
                                            <select
                                              value={linea.accion?.id ?? ''}
                                              onChange={e => handleMarcarAccion(fila, linea.id, e.target.value)}
                                              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                                            >
                                              <option value="">Sin marcar</option>
                                              {acciones.map(a => <option key={a.id} value={a.id}>{a.descripcion}</option>)}
                                            </select>
                                          ) : (
                                            <span>{linea.accion?.descripcion ?? '—'}</span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-3">
                                          {linea.oc ? (
                                            <Link
                                              href={`/compras/ordenes/${linea.oc.id}`}
                                              onClick={e => e.stopPropagation()}
                                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
                                            >
                                              {linea.oc.numero_oc}
                                            </Link>
                                          ) : (
                                            <span className="text-slate-400">— pendiente —</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
