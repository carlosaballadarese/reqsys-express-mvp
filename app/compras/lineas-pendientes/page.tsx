'use client'

import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProveedorSearch, type Proveedor } from '@/components/ProveedorSearch'
import { formatNumeroOc } from '@/lib/oc-utils'

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
  cantidad: number        // Spec: SC-012 — saldo disponible, no la cantidad total
  cantidad_total: number  // Spec: SC-012
  proveedor_sugerido: string | null
  precio_unitario: number | null
  total_estimado: number | null
  sla_badge: SlaBadge
  sla_dias_signo: number | null
  accion: AccionCatalogo | null
  // Spec: SC-016 — marca "En OC en proceso N° ___"
  oc_en_proceso: { id: string; numero_oc: string | null } | null
}

type Comprador = { id: string; nombre: string }
type Perfil = { id: string; nombre: string; rol: string; email: string }

// Spec: SC-013 — construcciones derivadas, solo en memoria del cliente (sin persistencia).
type GrupoNP = {
  np_id: string
  np_numero: string
  np_created_at: string
  solicitante_nombre: string
  proveedorSugeridoCabecera: string | null   // RN-02: null si las líneas de la NP no comparten valor
  lineas: LineaPendiente[]
}

type SortCampo = 'linea' | 'descripcion' | 'proveedor' | 'fecha'
type Sort = { campo: SortCampo; direccion: 'asc' | 'desc' } | null

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
  comprador: string; material: string
  npNumeros: string[]      // Spec: SC-014 CA-01
  proveedores: string[]    // Spec: SC-014 CA-03 — antes `proveedor: string` (valor único + sentinel 'todos')
  sinProveedor: boolean    // Spec: SC-014 CA-04
}

// Spec: HU-013 CA-02 — mismo patrón que HU-012 en Vista por NP (construirQueryParams
// compartido), preparado para un futuro botón de exportación (HU-015). SC-014: los 3
// filtros nuevos se serializan como CSV (npNumeros/proveedores) o 'true' (sinProveedor).
function construirQueryParams(filtros: Filtros): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.area !== 'todas') params.set('area', filtros.area)
  if (filtros.estado !== 'todos') params.set('estado', filtros.estado)
  if (filtros.accion !== 'todas' && filtros.estado === 'en_gestion') params.set('accion', filtros.accion)
  if (filtros.prioridad !== 'todas') params.set('prioridad', filtros.prioridad)
  if (filtros.sla !== 'todos') params.set('sla', filtros.sla)
  if (filtros.comprador !== 'todos') params.set('comprador', filtros.comprador)
  if (filtros.npNumeros.length > 0) params.set('npNumeros', filtros.npNumeros.join(','))
  if (filtros.proveedores.length > 0) params.set('proveedores', filtros.proveedores.join(','))
  if (filtros.sinProveedor) params.set('sinProveedor', 'true')
  if (filtros.material) params.set('material', filtros.material)
  return params
}

// Spec: SC-013 RN-02 — agrupa por NP asumiendo que `rows` ya viene ordenada por
// NP+línea desde el backend; si no lo estuviera, la agrupación igual sería correcta
// (usa un Map por np_id), solo cambiaría el orden entre grupos.
function agruparPorNP(rows: LineaPendiente[]): GrupoNP[] {
  const grupos: GrupoNP[] = []
  const indice = new Map<string, GrupoNP>()
  for (const r of rows) {
    let g = indice.get(r.np_id)
    if (!g) {
      g = {
        np_id: r.np_id, np_numero: r.np_numero, np_created_at: r.np_created_at,
        solicitante_nombre: r.solicitante_nombre, proveedorSugeridoCabecera: null, lineas: [],
      }
      indice.set(r.np_id, g)
      grupos.push(g)
    }
    g.lineas.push(r)
  }
  for (const g of grupos) {
    const valores = new Set(
      g.lineas.map(l => (l.proveedor_sugerido ?? '').trim()).filter(v => v !== '')
    )
    g.proveedorSugeridoCabecera = valores.size === 1 ? [...valores][0] : null
  }
  return grupos
}

// Spec: SC-013 — clic en un encabezado de columna aplana la vista (ver Decisión de
// diseño 3 de sdd-design.md); vuelve a la vista agrupada al recargar (RN-03) o con
// el botón "Agrupar por NP".
function ordenarFilasPlano(rows: LineaPendiente[], sort: Sort): LineaPendiente[] {
  if (!sort) return rows
  const factor = sort.direccion === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    switch (sort.campo) {
      case 'linea':       return (a.linea - b.linea) * factor
      case 'descripcion': return a.descripcion.localeCompare(b.descripcion) * factor
      case 'proveedor':   return (a.proveedor_sugerido ?? '').localeCompare(b.proveedor_sugerido ?? '') * factor
      case 'fecha':       return a.np_created_at.localeCompare(b.np_created_at) * factor
    }
  })
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC')
}

function esLineaExcepcional(fila: LineaPendiente) {
  return fila.prioridad === 'excepcional' && fila.estado === 'oc_directa'
}

// ─── Controles de selección múltiple (SC-014) ─────────────────────────────────

// Spec: SC-014 — checkbox con soporte de estado indeterminado; el DOM no lo expone
// como prop JSX, hay que setearlo imperativamente vía ref. Usado en la cabecera de
// cada NP (seleccionadosEnGrupo > 0 && < total ⇒ indeterminate).
function CheckboxTriEstado({ checked, indeterminate, onChange, ariaLabel }: {
  checked: boolean
  indeterminate: boolean
  onChange: (e: React.MouseEvent) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={() => {}}
      onClick={onChange}
      aria-label={ariaLabel}
    />
  )
}

// Spec: SC-014 CA-01/CA-03 — dropdown de selección múltiple con buscador, reutilizado
// para el filtro de N° de NP y el de Proveedor sugerido (Fase 1: "Dropdown con
// checkboxes + buscador", confirmado por el usuario).
function MultiSelectDropdown({ label, opciones, seleccionados, onChange }: {
  label: string
  opciones: string[]
  seleccionados: string[]
  onChange: (vals: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))

  function toggle(valor: string) {
    onChange(seleccionados.includes(valor) ? seleccionados.filter(v => v !== valor) : [...seleccionados, valor])
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
      >
        {label}{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
      </button>
      {abierto && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg">
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            className="h-8 text-xs m-1 w-[calc(100%-0.5rem)]"
          />
          <ul className="max-h-56 overflow-y-auto text-sm">
            {filtradas.length === 0 && (
              <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
            )}
            {filtradas.map(o => (
              <li key={o} className="px-2 py-1 hover:bg-blue-50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={seleccionados.includes(o)} onChange={() => toggle(o)} />
                  {o}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Modal Generar OC (HU-014) ────────────────────────────────────────────────

// Spec: HU-014 CA-04/CA-07, extendido por HU-016 CA-01/CA-03/CA-04 — modal de
// confirmación con detalle de líneas (de 1 o varias NPs) y prellenado de proveedor
// cuando todas las líneas comparten el mismo proveedor_sugerido.
function ModalGenerarOC({ lineas, onClose, onGenerado }: {
  lineas: LineaPendiente[]
  onClose: () => void
  onGenerado: (numeroOc: string | null) => void
}) {
  const npIdsModal = new Set(lineas.map(l => l.np_id))
  const esConsolidacion = npIdsModal.size > 1
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
    // Fix real (producción, 2026-11-11): `lineas[0]` no es necesariamente la línea
    // con el valor no vacío (otra línea seleccionada puede tener proveedor_sugerido
    // null) — asumirlo crasheaba toda la página con un TypeError no capturado dentro
    // de este useEffect síncrono. Se busca explícitamente la línea con valor real.
    const lineaConSugerido = lineas.find(l => (l.proveedor_sugerido ?? '').trim() !== '')
    const sugerido = lineaConSugerido?.proveedor_sugerido?.trim()
    if (!sugerido || sugerido.length < 2) return

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
      // Spec: HU-016 Decisión 4 — convertir/[id] sigue siendo el camino de 1 sola NP
      // (id de NP en la URL); 2+ NPs distintas usan el endpoint nuevo de consolidación.
      const url = esConsolidacion
        ? '/api/compras/ordenes/consolidar'
        : `/api/compras/convertir/${lineas[0].np_id}`
      const res = await fetch(url, {
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
            // Spec: SC-012 — desvío encontrado en validación de caja negra: `cantidad`
            // ahora es el saldo disponible, que legítimamente difiere de la cantidad
            // original de la línea en cuanto hay cobertura previa — HU-003 exige
            // justificación en ese caso (validarEnlaceYJustificacion). El motivo ya es
            // conocido por el sistema, no tiene sentido pedírselo al usuario.
            ...(l.cantidad_total > l.cantidad
              ? { justificacion_cantidad: `Saldo disponible tras cobertura parcial previa (${l.cantidad} de ${l.cantidad_total})` }
              : {}),
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
          <CardTitle className="text-base">
            {esConsolidacion ? `Consolidar ${npIdsModal.size} NPs en una Orden de Compra` : 'Generar Orden de Compra'}
          </CardTitle>
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
  const router = useRouter()
  const [perfil, setPerfil]         = useState<Perfil | null>(null)
  const [rows, setRows]             = useState<LineaPendiente[]>([])
  const [compradores, setCompradores] = useState<Comprador[]>([])
  const [acciones, setAcciones]     = useState<AccionCatalogo[]>([])
  const [proveedores, setProveedores] = useState<string[]>([])
  const [npsDisponibles, setNpsDisponibles] = useState<string[]>([])
  const [areas, setAreas]           = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando]     = useState(true)
  const [seleccion, setSeleccion]   = useState<Set<string>>(new Set())
  // Spec: SC-014 Decisión 3 — acumula TODAS las filas vistas en la sesión (no solo las
  // seleccionadas), para que la selección sobreviva a un cambio de filtro posterior.
  const [cacheLineas, setCacheLineas] = useState<Map<string, LineaPendiente>>(new Map())
  const [panelSeleccionadasAbierto, setPanelSeleccionadasAbierto] = useState(false)
  const [editando, setEditando]     = useState<Record<string, string>>({})
  const [modalAbierto, setModalAbierto] = useState(false)
  const [mensaje, setMensaje]       = useState<string | null>(null)
  // Spec: SC-013 — sort/colapso son estado de presentación puro, sin persistencia (RN-03)
  const [sort, setSort]             = useState<Sort>(null)
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set())

  // Spec: HU-014 CA-01 — 1 sola línea/NP genera OC directo (convertir/[id]); HU-016
  // CA-01/CA-02 levanta la restricción de "una sola NP": 2+ NPs son elegibles para
  // consolidar si comparten el mismo proveedor_sugerido no vacío, o si el proveedor
  // sugerido está vacío en cualquiera de las líneas seleccionadas.
  // Spec: SC-014 RN-03/Decisión 3 — se derivan de `cacheLineas`, no de `rows`, para que
  // sigan correctas aunque la línea ya no esté en el filtro actual.
  const filasSeleccionadas = [...seleccion]
    .map(id => cacheLineas.get(id))
    .filter((r): r is LineaPendiente => !!r)
  const npIdsSeleccionados = new Set(filasSeleccionadas.map(r => r.np_id))
  const esConsolidacion    = npIdsSeleccionados.size > 1
  // Spec: SC-014 Decisión 4 — ámbito "todo lo visible actualmente", usado por el checkbox
  // de encabezado de tabla (ya corregido en toggleSeleccionTodas() a unión/diferencia).
  const todasVisiblesSeleccionadas = rows.length > 0 && rows.every(r => seleccion.has(r.item_id))

  const proveedoresSugeridosSeleccion = new Set(
    filasSeleccionadas.map(r => (r.proveedor_sugerido ?? '').trim()).filter(v => v !== '')
  )
  const proveedoresEnConflicto = proveedoresSugeridosSeleccion.size > 1

  // Spec: HU-014 decisión de diseño 3, extendida por HU-016 — mismo criterio de HU-009
  // (botón "Completar NP" condicionado a asignado_a===userId para asistente_compras).
  // Esta vista muestra TODAS las líneas pendientes sin filtrar por asignación (HU-013),
  // así que sin este guard un asistente podría intentar generar/consolidar OC sobre una
  // NP ajena y solo enterarse por el 403. Se evalúa por CADA NP seleccionada (antes de
  // HU-016 alcanzaba con mirar la primera línea, porque solo se permitía 1 NP a la vez).
  const npsAjenasSeleccion = perfil?.rol === 'asistente_compras'
    ? [...npIdsSeleccionados].filter(npId =>
        filasSeleccionadas.some(r => r.np_id === npId && r.asignado_a !== perfil.id)
      )
    : []
  const npAsignadaAOtro = npsAjenasSeleccion.length > 0

  // Spec: SC-013 — vista agrupada por defecto (RN-01/RN-02); al ordenar por columna
  // se aplana (Decisión de diseño 3, sdd-design.md). `rows` ya llega ordenada por
  // NP asc + línea asc desde el backend.
  const vistaAgrupada = sort === null
  const grupos        = vistaAgrupada ? agruparPorNP(rows) : []
  const filasPlanas   = vistaAgrupada ? [] : ordenarFilasPlano(rows, sort)

  function alternarOrden(campo: SortCampo) {
    setSort(prev =>
      prev?.campo === campo
        ? { campo, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { campo, direccion: 'asc' }
    )
  }

  function alternarColapso(npId: string) {
    setGruposColapsados(prev => {
      const next = new Set(prev)
      if (next.has(npId)) next.delete(npId)
      else next.add(npId)
      return next
    })
  }

  const [filtros, setFiltros] = useState<Filtros>({
    area: 'todas', estado: 'todos', accion: 'todas', prioridad: 'todas', sla: 'todos',
    comprador: 'todos', material: '',
    npNumeros: [], proveedores: [], sinProveedor: false,
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
        setNpsDisponibles(data.npsDisponibles ?? [])
        // Spec: SC-014 RN-03 — ya NO se vacía `seleccion` aquí (antes: setSeleccion(new Set())).
        // La cache acumula todo lo visto para que la selección sobreviva al cambio de filtro.
        setCacheLineas(prev => {
          const next = new Map(prev)
          for (const r of (data.rows ?? [])) next.set(r.item_id, r)
          return next
        })
        // Spec: SC-013 RN-03 — toda nueva carga restablece el orden por defecto
        setSort(null)
        setGruposColapsados(new Set())
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

  // Spec: SC-014 Decisión 4 — fix real: antes reemplazaba toda la selección por la de
  // `rows`, lo que borraría silenciosamente líneas seleccionadas bajo un filtro anterior
  // (contrario a RN-03). Pasa a ser unión/diferencia, nunca reemplazo.
  function toggleSeleccionTodas() {
    const idsVisibles = rows.map(r => r.item_id)
    const todasSeleccionadas = idsVisibles.length > 0 && idsVisibles.every(id => seleccion.has(id))
    setSeleccion(prev => {
      const next = new Set(prev)
      idsVisibles.forEach(id => todasSeleccionadas ? next.delete(id) : next.add(id))
      return next
    })
  }

  // Spec: SC-014 CA-05 — ámbito "todo lo visible actualmente bajo el filtro", solo-unión.
  function seleccionarTodoLoFiltrado() {
    setSeleccion(prev => {
      const next = new Set(prev)
      rows.forEach(r => next.add(r.item_id))
      return next
    })
  }

  // Spec: SC-014 CA-05 — única acción que vacía la selección completa, incluso lo no
  // visible bajo el filtro actual (a diferencia de deschequear el checkbox de tabla).
  function limpiarSeleccion() {
    setSeleccion(new Set())
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

  // Spec: SC-013 — indicador visual ▲/▼ en el encabezado de columna activo en sort
  function flechaOrden(campo: SortCampo) {
    if (sort?.campo !== campo) return null
    return sort.direccion === 'asc' ? ' ▲' : ' ▼'
  }

  // Spec: SC-013 — celdas compartidas entre la vista agrupada (sub-fila) y la vista
  // plana, para no duplicar el markup de cada columna de línea en ambos modos.
  function celdasInicio(fila: LineaPendiente) {
    const excepcional = esLineaExcepcional(fila)
    return [
      <td key="chk" className="py-3 pr-2">
        <input
          type="checkbox"
          checked={seleccion.has(fila.item_id)}
          onChange={() => toggleSeleccion(fila.item_id)}
          aria-label={`Seleccionar línea ${fila.linea} de ${fila.np_numero}`}
        />
      </td>,
      <td key="prio" className="py-3 pr-4">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORIDAD_DOT[fila.prioridad]} ${excepcional ? 'animate-pulse' : ''}`}
          title={PRIORIDAD_LABEL[fila.prioridad]}
        />
        {excepcional && <p className="text-[10px] font-semibold text-red-700 mt-1">⚠ EMERGENCIA</p>}
      </td>,
    ]
  }

  function celdasResto(fila: LineaPendiente) {
    return [
      <td key="linea" className="py-3 pr-4">{fila.linea}</td>,
      <td key="desc" className="py-3 pr-4 max-w-xs truncate" title={fila.descripcion}>{fila.descripcion}</td>,
      <td key="cant" className="py-3 pr-4 text-right">
        <span className="font-medium">{fila.cantidad}</span>
        {fila.cantidad_total > fila.cantidad && (
          <p
            className="text-[10px] text-amber-600 mt-0.5"
            title={`Comprometido: ${fila.cantidad_total - fila.cantidad} de ${fila.cantidad_total} (OC vigente)`}
          >
            de {fila.cantidad_total}
          </p>
        )}
        {/* Spec: SC-016 — marca "En OC en proceso N° ___" (regla de negocio 6) */}
        {fila.oc_en_proceso && (
          <Link
            href={`/compras/ordenes/${fila.oc_en_proceso.id}`}
            onClick={e => e.stopPropagation()}
            className="block text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1 mt-0.5 hover:underline"
          >
            En OC en proceso N° {formatNumeroOc(fila.oc_en_proceso.numero_oc)}
          </Link>
        )}
      </td>,
      <td key="prov" className="py-3 pr-4">
        {/* Spec CA-04: edición inline, persiste al perder el foco */}
        <Input
          value={editando[fila.item_id] ?? fila.proveedor_sugerido ?? ''}
          onChange={e => setEditando(prev => ({ ...prev, [fila.item_id]: e.target.value }))}
          onBlur={e => persistirProveedorSugerido(fila.item_id, e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="h-8 text-xs min-w-[140px]"
        />
      </td>,
      <td key="pu" className="py-3 pr-4 text-right">
        {fila.precio_unitario !== null ? usd(fila.precio_unitario) : '—'}
      </td>,
      <td key="tot" className="py-3 pr-4 text-right font-medium">
        {fila.total_estimado !== null ? usd(fila.total_estimado) : '—'}
      </td>,
      <td key="sla" className="py-3 pr-4">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SLA_BADGE_CLASS[fila.sla_badge]}`}>
          {SLA_LABEL[fila.sla_badge]}
        </span>
      </td>,
      <td key="est" className="py-3 pr-4">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[fila.estado] ?? 'bg-slate-100 text-slate-700'}`}>
          {ESTADO_LABEL[fila.estado] ?? fila.estado}
        </span>
      </td>,
      <td key="acc" className="py-3 pr-4">
        {fila.accion ? fila.accion.descripcion : <span className="text-slate-300">—</span>}
      </td>,
    ]
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <h1 className="text-white text-xl font-bold">Líneas Pendientes de OC</h1>
          <p className="text-blue-300 text-xs mt-0.5">Líneas de NP aprobadas o en gestión que aún no tienen Orden de Compra</p>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
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
                {compradores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>

              {/* Spec: SC-014 CA-01 — selección múltiple de N° de NP, con buscador */}
              <MultiSelectDropdown
                label="N° de NP"
                opciones={npsDisponibles}
                seleccionados={filtros.npNumeros}
                onChange={vals => setFiltros(f => ({ ...f, npNumeros: vals }))}
              />

              {/* Spec: SC-014 CA-03 — selección múltiple de Proveedor sugerido, dinámico */}
              <MultiSelectDropdown
                label="Proveedor sugerido"
                opciones={proveedores}
                seleccionados={filtros.proveedores}
                onChange={vals => setFiltros(f => ({ ...f, proveedores: vals }))}
              />

              {/* Spec: SC-014 CA-04 — combina con OR junto al filtro de proveedores (RN-02) */}
              <label className="flex items-center gap-2 h-9 px-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={filtros.sinProveedor}
                  onChange={e => setFiltros(f => ({ ...f, sinProveedor: e.target.checked }))}
                />
                Sin proveedor sugerido
              </label>

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

        {/* Barra de selección — Spec: HU-014 CA-01/CA-02, HU-016 CA-01/CA-02 */}
        {seleccion.size > 0 && (
          <Card className="border-[#c9a840] bg-amber-50/50">
            <CardContent className="py-3 flex items-center justify-between text-sm">
              {/* Spec: SC-014 Decisión 5 — formato siempre explícito (antes: el conteo de
                  NP solo aparecía con 2+ NPs seleccionadas) */}
              <span>
                {seleccion.size} línea(s) de {npIdsSeleccionados.size} NP(s)
              </span>
              {proveedoresEnConflicto ? (
                <span className="text-xs text-red-600 font-medium">
                  Proveedores sugeridos en conflicto ({[...proveedoresSugeridosSeleccion].join(', ')}) — no se pueden consolidar en una misma OC
                </span>
              ) : npAsignadaAOtro ? (
                <span className="text-xs text-red-600 font-medium">
                  {esConsolidacion
                    ? 'Una o más NPs seleccionadas están asignadas a otro comprador'
                    : 'Esta NP está asignada a otro comprador'} — no puedes generar su OC
                </span>
              ) : (
                <div className="flex gap-2">
                  {/* Spec: SC-016 Decisión 4 — relabel de "Generar OC"/"Consolidar en
                      OC": el resultado real siempre ha sido dejar la OC en_proceso */}
                  <Button onClick={() => setModalAbierto(true)} className="h-8 btn-primary text-xs">
                    Guardar en proceso
                  </Button>
                  {/* Spec: HU-019 CA-01 — solo con líneas de UNA sola NP seleccionada */}
                  {!esConsolidacion && (
                    <Button
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        const ids = [...seleccion].join(',')
                        router.push(`/compras/ocas/nueva?desde_items=${encodeURIComponent(ids)}`)
                      }}
                    >
                      Crear OCA desde esta NP
                    </Button>
                  )}
                </div>
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
            <div className="flex gap-2">
              {/* Spec: SC-014 CA-01/CA-05 — ámbito "todo lo visible actualmente", solo-unión */}
              <Button
                variant="outline"
                disabled={rows.length === 0}
                onClick={seleccionarTodoLoFiltrado}
                className="h-8 text-xs"
              >
                Seleccionar todo lo filtrado
              </Button>
              {/* Spec: SC-014 CA-05 — única acción que limpia toda la selección, incluso
                  lo no visible bajo el filtro actual */}
              <Button
                variant="outline"
                disabled={seleccion.size === 0}
                onClick={limpiarSeleccion}
                className="h-8 text-xs"
              >
                Limpiar selección
              </Button>
              {/* Spec: SC-014 CA-07 — panel colapsable, no reemplaza la tabla */}
              <Button
                variant="outline"
                onClick={() => setPanelSeleccionadasAbierto(a => !a)}
                className="h-8 text-xs"
              >
                📋 Seleccionadas ({seleccion.size})
              </Button>
              {/* Spec: SC-013 — escape hatch de vuelta a la vista agrupada sin recargar */}
              {!vistaAgrupada && (
                <Button variant="outline" onClick={() => setSort(null)} className="h-8 text-xs">
                  🔄 Agrupar por NP
                </Button>
              )}
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
            </div>
          </CardHeader>
          {/* Spec: SC-014 CA-07 — panel "Seleccionadas", colapsable, no reemplaza la tabla.
              Lee de cacheLineas (vía filasSeleccionadas), sin consulta nueva al backend. */}
          {panelSeleccionadasAbierto && (
            <CardContent className="py-3 border-b bg-slate-50">
              {filasSeleccionadas.length === 0 ? (
                <p className="text-sm text-slate-400">Sin líneas seleccionadas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {filasSeleccionadas.map(f => (
                        <tr key={f.item_id} className="border-b">
                          <td className="py-1 pr-3 font-medium text-[#1a5252]">{f.np_numero}</td>
                          <td className="py-1 pr-3">L{f.linea}</td>
                          <td className="py-1 pr-3 max-w-xs truncate" title={f.descripcion}>{f.descripcion}</td>
                          <td className="py-1 pr-3 text-right">{f.cantidad}</td>
                          <td className="py-1 text-right">
                            <button
                              type="button"
                              onClick={() => setSeleccion(prev => { const n = new Set(prev); n.delete(f.item_id); return n })}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay líneas pendientes con los filtros aplicados.</div>
            ) : vistaAgrupada ? (
              // Spec: SC-013 RN-01/RN-02 — vista agrupada por defecto, expandida (CA)
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-2 w-8">
                        <input
                          type="checkbox"
                          checked={todasVisiblesSeleccionadas}
                          onChange={toggleSeleccionTodas}
                          aria-label="Seleccionar todas"
                        />
                      </th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('linea')}>Línea{flechaOrden('linea')}</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('descripcion')}>Descripción{flechaOrden('descripcion')}</th>
                      <th className="text-right py-3 pr-4">Cantidad</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('proveedor')}>Proveedor sugerido{flechaOrden('proveedor')}</th>
                      <th className="text-right py-3 pr-4">Precio Unit.</th>
                      <th className="text-right py-3 pr-4">Total NP</th>
                      <th className="text-left py-3 pr-4">SLA</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map(g => {
                      // Spec: SC-014 CA-02 — checkbox de cabecera tri-estado, ámbito: esta NP
                      const idsGrupo = g.lineas.map(l => l.item_id)
                      const seleccionadosEnGrupo = idsGrupo.filter(id => seleccion.has(id)).length
                      const estadoGrupo: 'vacio' | 'parcial' | 'completo' =
                        seleccionadosEnGrupo === 0 ? 'vacio' : seleccionadosEnGrupo === idsGrupo.length ? 'completo' : 'parcial'
                      function toggleGrupo(e: React.MouseEvent) {
                        e.stopPropagation()
                        setSeleccion(prev => {
                          const next = new Set(prev)
                          idsGrupo.forEach(id => estadoGrupo === 'completo' ? next.delete(id) : next.add(id))
                          return next
                        })
                      }
                      return (
                      <Fragment key={g.np_id}>
                        {/* Spec: RN-02 — cabecera por NP, expandida por defecto, contraíble;
                            número y fecha son clicables por separado (navegar / ordenar) */}
                        <tr
                          className="border-b bg-slate-100 hover:bg-slate-200 cursor-pointer"
                          onClick={() => alternarColapso(g.np_id)}
                        >
                          <td colSpan={11} className="py-2 px-3">
                            <div className="flex flex-wrap items-center gap-4">
                              <CheckboxTriEstado
                                checked={estadoGrupo === 'completo'}
                                indeterminate={estadoGrupo === 'parcial'}
                                onChange={toggleGrupo}
                                ariaLabel={`Seleccionar todas las líneas de ${g.np_numero}`}
                              />
                              <span className="font-semibold text-[#1a5252]">
                                {gruposColapsados.has(g.np_id) ? '▶' : '▼'}{' '}
                                <Link
                                  href={`/compras/${g.np_id}`}
                                  className="hover:underline"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {g.np_numero}
                                </Link>
                              </span>
                              <button
                                type="button"
                                className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-700"
                                onClick={e => { e.stopPropagation(); alternarOrden('fecha') }}
                                title="Ordenar por fecha"
                              >
                                📅 {fechaCorta(g.np_created_at)}{flechaOrden('fecha')}
                              </button>
                              <span className="text-xs text-slate-600">{g.solicitante_nombre}</span>
                              <span className="text-xs text-slate-600">{g.proveedorSugeridoCabecera ?? '—'}</span>
                              <span className="text-xs text-slate-400 ml-auto">
                                {g.lineas.length} línea{g.lineas.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!gruposColapsados.has(g.np_id) && g.lineas.map(fila => (
                          <tr key={fila.item_id} className={`border-b hover:bg-slate-50 ${esLineaExcepcional(fila) ? 'bg-red-50' : ''}`}>
                            {celdasInicio(fila)}
                            {celdasResto(fila)}
                          </tr>
                        ))}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              // Spec: SC-013 Decisión de diseño 3 — vista plana al ordenar por columna
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-2 w-8">
                        <input
                          type="checkbox"
                          checked={todasVisiblesSeleccionadas}
                          onChange={toggleSeleccionTodas}
                          aria-label="Seleccionar todas"
                        />
                      </th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4">NP</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('fecha')}>Fecha NP{flechaOrden('fecha')}</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('linea')}>Línea{flechaOrden('linea')}</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('descripcion')}>Descripción{flechaOrden('descripcion')}</th>
                      <th className="text-right py-3 pr-4">Cantidad</th>
                      <th className="text-left py-3 pr-4 cursor-pointer select-none" onClick={() => alternarOrden('proveedor')}>Proveedor sugerido{flechaOrden('proveedor')}</th>
                      <th className="text-right py-3 pr-4">Precio Unit.</th>
                      <th className="text-right py-3 pr-4">Total NP</th>
                      <th className="text-left py-3 pr-4">SLA</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasPlanas.map(fila => (
                      <tr key={fila.item_id} className={`border-b hover:bg-slate-50 ${esLineaExcepcional(fila) ? 'bg-red-50' : ''}`}>
                        {celdasInicio(fila)}
                        <td className="py-3 pr-4">
                          <Link href={`/compras/${fila.np_id}`} className="font-medium text-[#1a5252] hover:underline">
                            {fila.np_numero}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">{fechaCorta(fila.np_created_at)}</td>
                        <td className="py-3 pr-4">{fila.solicitante_nombre}</td>
                        {celdasResto(fila)}
                      </tr>
                    ))}
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
            // Spec: SC-016 — numero_oc queda null hasta "Emitir OC" (RN-01).
            setMensaje(numeroOc ? `OC ${numeroOc} generada correctamente` : 'OC guardada en proceso — sin número asignado todavía')
            cargar() // Spec CA-05: las líneas convertidas desaparecen de la vista
          }}
        />
      )}
    </div>
  )
}
