'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProveedorSearch, type Proveedor } from '@/components/ProveedorSearch'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AccionCatalogo = { id: string; orden: number; descripcion: string }
type SlaBadge = 'no_activo' | 'pausado' | 'a_tiempo' | 'vencido'

type LineaPendiente = {
  item_id: string
  np_id: string
  np_numero: string
  np_created_at: string
  area: string
  solicitante_nombre: string
  prioridad: 'excepcional' | 'alta' | 'media' | 'baja'
  estado: string
  asignado_a: string | null
  asignado_nombre: string | null
  linea: number
  codigo: string | null
  unidad: string
  descripcion: string
  cantidad: number
  proveedor_sugerido: string | null
  precio_unitario: number | null
  total_estimado: number | null
  sla_badge: SlaBadge
  sla_dias_signo: number | null
  accion: AccionCatalogo | null
}

type Comprador = { id: string; nombre: string }
type Perfil = { id: string; nombre: string; rol: string; email: string }

// ─── Constantes visuales (espejo de vista-np/page.tsx, mismo criterio de
// duplicar mapas pequeños en cada 'use client' en vez de importarlos de un
// módulo que toca adminClient()) — pero acotadas a los 3 Estados de esta vista.

const ESTADO_BADGE: Record<string, string> = {
  aprobada:   'bg-green-100 text-green-800',
  en_gestion: 'bg-cyan-100 text-cyan-800',
  oc_directa: 'bg-orange-100 text-orange-800',
}

const ESTADO_LABEL: Record<string, string> = {
  aprobada:   'Aprobada',
  en_gestion: 'En gestión',
  oc_directa: 'OC directa',
}

// Spec CA-01/CA-02 — único subconjunto de Estados con líneas potencialmente pendientes
const ESTADOS = ['todos', 'aprobada', 'en_gestion', 'oc_directa']

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

function usd(n: number) {
  return `$${Number(n).toFixed(2)}`
}

type Filtros = {
  area: string; estado: string; accion: string; prioridad: string; sla: string
  comprador: string; proveedor: string; material: string
}

// Spec: HU-013 CA-02 — mismo patrón que HU-012 en Vista por NP (construirQueryParams
// compartido), preparado para un futuro botón de exportación (HU-015).
function construirQueryParams(filtros: Filtros): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.area !== 'todas') params.set('area', filtros.area)
  if (filtros.estado !== 'todos') params.set('estado', filtros.estado)
  if (filtros.accion !== 'todas' && filtros.estado === 'en_gestion') params.set('accion', filtros.accion)
  if (filtros.prioridad !== 'todas') params.set('prioridad', filtros.prioridad)
  if (filtros.sla !== 'todos') params.set('sla', filtros.sla)
  if (filtros.comprador !== 'todos') params.set('comprador', filtros.comprador)
  if (filtros.proveedor !== 'todos') params.set('proveedor', filtros.proveedor)
  if (filtros.material) params.set('material', filtros.material)
  return params
}

// ─── Modal Generar OC (HU-014) ────────────────────────────────────────────────

// Spec: HU-014 CA-04/CA-07 — modal de confirmación con detalle de líneas y
// prellenado de proveedor cuando todas las líneas comparten el mismo proveedor_sugerido.
function ModalGenerarOC({ lineas, onClose, onGenerado }: {
  lineas: LineaPendiente[]
  onClose: () => void
  onGenerado: (numeroOc: string) => void
}) {
  const [proveedorId, setProveedorId]         = useState('')
  const [proveedorTexto, setProveedorTexto]   = useState('')
  const [enviando, setEnviando]               = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  useEffect(() => {
    // Spec CA-07: coincidencia case-insensitive + trim contra proveedores.nombre (activos).
    // Solo si TODAS las líneas comparten el mismo proveedor_sugerido no vacío.
    const sugeridos = new Set(
      lineas.map(l => (l.proveedor_sugerido ?? '').trim().toLowerCase()).filter(s => s !== '')
    )
    if (sugeridos.size !== 1) return
    const sugerido = lineas[0].proveedor_sugerido!.trim()
    if (sugerido.length < 2) return

    fetch(`/api/compras/proveedores?q=${encodeURIComponent(sugerido)}`)
      .then(r => r.ok ? r.json() : [])
      .then((candidatos: Proveedor[]) => {
        const exactos = candidatos.filter(
          p => p.nombre.trim().toLowerCase() === sugerido.toLowerCase()
        )
        if (exactos.length === 1) {
          setProveedorId(exactos[0].id)
          setProveedorTexto(exactos[0].nombre)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmar() {
    if (!proveedorId || lineas.length === 0) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/compras/convertir/${lineas[0].np_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: proveedorId,
          items: lineas.map(l => ({
            item_np_id:      l.item_id,
            codigo:          l.codigo,
            descripcion:     l.descripcion,
            unidad:          l.unidad,
            cantidad:        l.cantidad,
            precio_unitario: l.precio_unitario ?? 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error === 'sobrecompra' ? data.message : (data.error ?? 'Error al generar la OC'))
        return
      }
      onGenerado(data.numero_oc)
    } catch {
      setError('Error de red al generar la OC')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-base">Generar Orden de Compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-500 text-xs uppercase">
                  <th className="text-left py-2 pr-3">NP</th>
                  <th className="text-left py-2 pr-3">Línea</th>
                  <th className="text-left py-2 pr-3">Descripción</th>
                  <th className="text-right py-2 pr-3">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map(l => (
                  <tr key={l.item_id} className="border-b">
                    <td className="py-2 pr-3">{l.np_numero}</td>
                    <td className="py-2 pr-3">{l.linea}</td>
                    <td className="py-2 pr-3">{l.descripcion}</td>
                    <td className="py-2 pr-3 text-right">{l.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Proveedor *</label>
            <ProveedorSearch
              value={proveedorTexto}
              onChange={val => { setProveedorTexto(val); setProveedorId('') }}
              onSelect={p => { setProveedorId(p.id); setProveedorTexto(p.nombre) }}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!proveedorId || enviando} className="btn-primary">
              {enviando ? 'Generando...' : 'Confirmar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function LineasPendientesPage() {
  const [perfil, setPerfil]         = useState<Perfil | null>(null)
  const [rows, setRows]             = useState<LineaPendiente[]>([])
  const [compradores, setCompradores] = useState<Comprador[]>([])
  const [acciones, setAcciones]     = useState<AccionCatalogo[]>([])
  const [proveedores, setProveedores] = useState<string[]>([])
  const [areas, setAreas]           = useState<string[]>([])
  const [cargando, setCargando]     = useState(true)
  const [seleccion, setSeleccion]   = useState<Set<string>>(new Set())
  const [editando, setEditando]     = useState<Record<string, string>>({})
  const [modalAbierto, setModalAbierto] = useState(false)
  const [mensaje, setMensaje]       = useState<string | null>(null)

  // Spec: HU-014 CA-01/CA-02 — la restricción de "una sola NP" ya es estructural en
  // POST /api/compras/convertir/[id] (toma el id de NP de la URL); esto es solo UX.
  const filasSeleccionadas = rows.filter(r => seleccion.has(r.item_id))
  const npIdsSeleccionados = new Set(filasSeleccionadas.map(r => r.np_id))
  const mismaNp            = npIdsSeleccionados.size <= 1

  // Spec: HU-014 decisión de diseño 3 — mismo criterio de HU-009 (botón "Completar NP"
  // condicionado a asignado_a===userId para asistente_compras). Esta vista muestra TODAS
  // las líneas pendientes sin filtrar por asignación (HU-013), así que sin este guard un
  // asistente podría intentar generar OC sobre una NP ajena y solo enterarse por el 403.
  const npAsignadaAOtro =
    perfil?.rol === 'asistente_compras' &&
    filasSeleccionadas.length > 0 &&
    filasSeleccionadas[0].asignado_a !== perfil.id

  const [filtros, setFiltros] = useState<Filtros>({
    area: 'todas', estado: 'todos', accion: 'todas', prioridad: 'todas', sla: 'todos',
    comprador: 'todos', proveedor: 'todos', material: '',
  })

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
      const res = await fetch(`/api/compras/nps/lineas-pendientes?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows ?? [])
        setCompradores(data.compradoresDisponibles ?? [])
        setAcciones(data.accionesCatalogo ?? [])
        setProveedores(data.proveedoresDisponibles ?? [])
        setSeleccion(new Set())
      }
    } finally {
      setCargando(false)
    }
  }, [filtros])

  useEffect(() => { cargar() }, [cargar])

  function toggleSeleccion(itemId: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function toggleSeleccionTodas() {
    setSeleccion(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.item_id)))
  }

  // Spec CA-04 — persiste al perder el foco; 409 significa que otra persona ya
  // generó la OC de esta línea mientras la vista estaba abierta (condición de
  // carrera con HU-014) — se recarga la tabla en vez de dejar un dato huérfano.
  async function persistirProveedorSugerido(itemId: string, valor: string) {
    const res = await fetch(`/api/compras/nps/lineas-pendientes/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_sugerido: valor.trim() === '' ? null : valor.trim() }),
    })
    setEditando(prev => { const next = { ...prev }; delete next[itemId]; return next })
    if (res.status === 409) { cargar(); return }
    if (res.ok) {
      setRows(prev => prev.map(r => r.item_id === itemId ? { ...r, proveedor_sugerido: valor } : r))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-white text-xl font-bold">Líneas Pendientes de OC</h1>
          <p className="text-blue-300 text-xs mt-0.5">Líneas de NP aprobadas o en gestión que aún no tienen Orden de Compra</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <select
                value={filtros.area}
                onChange={e => setFiltros(f => ({ ...f, area: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas las áreas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
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
                {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>

              {/* Spec CA-02: dinámico, según proveedor_sugerido presente en las líneas pendientes */}
              <select
                value={filtros.proveedor}
                onChange={e => setFiltros(f => ({ ...f, proveedor: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todos">Todos los proveedores</option>
                {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <Input
                placeholder="Material / Descripción..."
                value={filtros.material}
                onChange={e => setFiltros(f => ({ ...f, material: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <Button onClick={cargar} className="h-9 btn-primary">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {mensaje && (
          <Card className="border-green-400 bg-green-50">
            <CardContent className="py-3 flex items-center justify-between text-sm text-green-800">
              <span>{mensaje}</span>
              <button onClick={() => setMensaje(null)} className="text-green-600 hover:underline text-xs">Cerrar</button>
            </CardContent>
          </Card>
        )}

        {/* Barra de selección — Spec: HU-014 CA-01/CA-02 */}
        {seleccion.size > 0 && (
          <Card className="border-[#c9a840] bg-amber-50/50">
            <CardContent className="py-3 flex items-center justify-between text-sm">
              <span>{seleccion.size} línea(s) seleccionada(s)</span>
              {!mismaNp ? (
                <span className="text-xs text-red-600 font-medium">
                  Solo se pueden seleccionar líneas de una misma NP para generar una OC
                </span>
              ) : npAsignadaAOtro ? (
                <span className="text-xs text-red-600 font-medium">
                  Esta NP está asignada a otro comprador — no puedes generar su OC
                </span>
              ) : (
                <Button onClick={() => setModalAbierto(true)} className="h-8 btn-primary text-xs">
                  Generar OC
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${rows.length} líneas pendientes`}
            </CardTitle>
            {/* Spec: HU-015 CA-01/CA-03 — exporta respetando los filtros activos */}
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() => {
                const params = construirQueryParams(filtros)
                window.location.href = `/api/compras/nps/lineas-pendientes/excel?${params.toString()}`
              }}
              className="h-8 text-xs"
            >
              ⬇ Exportar a Excel
            </Button>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay líneas pendientes con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-2 w-8">
                        <input
                          type="checkbox"
                          checked={seleccion.size === rows.length}
                          onChange={toggleSeleccionTodas}
                          aria-label="Seleccionar todas"
                        />
                      </th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4">NP</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4">Línea</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-right py-3 pr-4">Cantidad</th>
                      <th className="text-left py-3 pr-4">Proveedor sugerido</th>
                      <th className="text-right py-3 pr-4">Precio Unit.</th>
                      <th className="text-right py-3 pr-4">Total NP</th>
                      <th className="text-left py-3 pr-4">SLA</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(fila => {
                      const esExcepcional = fila.prioridad === 'excepcional' && fila.estado === 'oc_directa'
                      return (
                        <tr key={fila.item_id} className={`border-b hover:bg-slate-50 ${esExcepcional ? 'bg-red-50' : ''}`}>
                          <td className="py-3 pr-2">
                            <input
                              type="checkbox"
                              checked={seleccion.has(fila.item_id)}
                              onChange={() => toggleSeleccion(fila.item_id)}
                              aria-label={`Seleccionar línea ${fila.linea} de ${fila.np_numero}`}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORIDAD_DOT[fila.prioridad]} ${esExcepcional ? 'animate-pulse' : ''}`}
                              title={PRIORIDAD_LABEL[fila.prioridad]}
                            />
                            {esExcepcional && (
                              <p className="text-[10px] font-semibold text-red-700 mt-1">⚠ EMERGENCIA</p>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <Link href={`/compras/${fila.np_id}`} className="font-medium text-[#1a5252] hover:underline">
                              {fila.np_numero}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">{fila.solicitante_nombre}</td>
                          <td className="py-3 pr-4">{fila.linea}</td>
                          <td className="py-3 pr-4 max-w-xs truncate" title={fila.descripcion}>{fila.descripcion}</td>
                          <td className="py-3 pr-4 text-right">{fila.cantidad}</td>
                          <td className="py-3 pr-4">
                            {/* Spec CA-04: edición inline, persiste al perder el foco */}
                            <Input
                              value={editando[fila.item_id] ?? fila.proveedor_sugerido ?? ''}
                              onChange={e => setEditando(prev => ({ ...prev, [fila.item_id]: e.target.value }))}
                              onBlur={e => persistirProveedorSugerido(fila.item_id, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              className="h-8 text-xs min-w-[140px]"
                            />
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {fila.precio_unitario !== null ? usd(fila.precio_unitario) : '—'}
                          </td>
                          <td className="py-3 pr-4 text-right font-medium">
                            {fila.total_estimado !== null ? usd(fila.total_estimado) : '—'}
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
                            {fila.accion ? fila.accion.descripcion : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spec: HU-014 CA-04 */}
      {modalAbierto && (
        <ModalGenerarOC
          lineas={filasSeleccionadas}
          onClose={() => setModalAbierto(false)}
          onGenerado={(numeroOc) => {
            setModalAbierto(false)
            setSeleccion(new Set())
            setMensaje(`OC ${numeroOc} generada correctamente`)
            cargar() // Spec CA-05: las líneas convertidas desaparecen de la vista
          }}
        />
      )}
    </div>
  )
}
