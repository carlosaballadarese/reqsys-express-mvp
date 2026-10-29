'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type OcaItem = {
  id: string; codigo: string; descripcion: string; unidad: string
  precio_unitario: number | null; precio_maximo: number | null; categoria: string | null
}
type Area = { id: string; nombre: string }
type Historial = { id: string; estado: string; actor_nombre: string | null; actor_email: string | null; notas: string | null; created_at: string }
type ModalidadFacturacion = 'mensual_consolidada' | 'por_release'
type Oca = {
  id: string; numero_oca: string; proveedor_id: string; tipo: string
  descripcion: string; fecha_inicio: string; fecha_fin: string
  presupuesto_total: number; referencia_contractual: string; estado: string
  consumido: number; disponible: number; porcentaje_ejecucion: number
  motivo_rechazo: string | null; motivo_suspension: string | null; motivo_cierre: string | null
  modalidad_facturacion: ModalidadFacturacion
  // Spec: HU-024 CA-01/CA-02
  alerta_presupuesto: '100' | '90' | '80' | null
  alerta_vigencia: boolean
}
type Proveedor = { id: string; nombre: string }
type ItemForm = {
  codigo: string; descripcion: string; unidad: string; categoria: string
  precio_unitario: string; precio_maximo: string
}
const ITEM_VACIO: ItemForm = { codigo: '', descripcion: '', unidad: '', categoria: '', precio_unitario: '', precio_maximo: '' }

// Spec: HU-020 — tipos de enmienda y su campo propio
// Spec: HU-022 — 4to tipo, cambio_modalidad_facturacion
type TipoEnmienda = 'incremento_presupuesto' | 'extension_plazo' | 'modificacion_precios' | 'cambio_modalidad_facturacion'
type Enmienda = {
  id: string; tipo: TipoEnmienda; estado: 'pendiente' | 'aprobada' | 'rechazada'
  justificacion: string; referencia_contractual: string
  monto_adicional: number | null; fecha_fin_nueva: string | null
  items_nuevos: { codigo: string; descripcion: string; unidad: string; precio_unitario?: number | null; precio_maximo?: number | null }[] | null
  modalidad_facturacion_nueva: ModalidadFacturacion | null
  solicitado_en: string; aprobado_en: string | null; motivo_rechazo: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_aprobacion: 'En aprobación', vigente: 'Vigente',
  suspendida: 'Suspendida', agotada: 'Agotada', vencida: 'Vencida', cerrada: 'Cerrada',
}
const ESTADOS_NO_TERMINALES = ['vigente', 'suspendida', 'agotada', 'vencida']

const TIPO_ENMIENDA_LABEL: Record<TipoEnmienda, string> = {
  incremento_presupuesto: 'Incremento de presupuesto',
  extension_plazo: 'Extensión de plazo',
  modificacion_precios: 'Modificación de lista de precios',
  cambio_modalidad_facturacion: 'Cambio de modalidad de facturación',
}
const ESTADO_ENMIENDA_LABEL: Record<Enmienda['estado'], string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
}
const MODALIDAD_FACTURACION_LABEL: Record<ModalidadFacturacion, string> = {
  mensual_consolidada: 'Mensual consolidada',
  por_release: 'Por release',
}
// Spec: HU-024 CA-01/CA-02
const ALERTA_PRESUPUESTO_COLOR: Record<string, string> = {
  '100': 'bg-red-100 text-red-700', '90': 'bg-orange-100 text-orange-700', '80': 'bg-amber-100 text-amber-700',
}

// Spec: HU-021 — releases (descargos) contra una OCA vigente
type Release = {
  id: string; numero_release: string; area_id: string
  monto_total: number; observaciones: string | null
  estado: 'pendiente_aprobacion' | 'aprobado' | 'rechazado' | 'anulado'
  motivo_rechazo: string | null; motivo_anulacion: string | null
  created_at: string
  // Spec: HU-022 CA-08
  facturado: boolean; numero_factura: string | null
  // Spec: HU-024 CA-03
  alerta_antiguedad: boolean
}
type ReleaseItemForm = { oca_item_id: string; seleccionado: boolean; cantidad: string; precio_unitario: string }
const RELEASE_ESTADO_LABEL: Record<Release['estado'], string> = {
  pendiente_aprobacion: 'Pendiente de aprobación', aprobado: 'Aprobado', rechazado: 'Rechazado', anulado: 'Anulado',
}
// Spec: HU-021 RN-01 — roles que generan release
const ROLES_GENERAR_RELEASE = ['solicitante', 'bodega', 'compras', 'admin', 'asistente_compras']

function usd(n: number) {
  return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function DetalleOcaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [rol, setRol]           = useState<string | null>(null)
  const [oca, setOca]           = useState<Oca | null>(null)
  const [items, setItems]       = useState<OcaItem[]>([])
  const [areasHab, setAreasHab] = useState<Area[]>([])
  const [historial, setHistorial] = useState<Historial[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  const [modalAccion, setModalAccion] = useState<'aprobar' | 'rechazar' | 'suspender' | 'cerrar' | null>(null)
  const [motivo, setMotivo]           = useState('')
  const [procesando, setProcesando]   = useState(false)

  // Spec: HU-018 Decisión de diseño #5 — edición inline en la misma página,
  // sin ruta separada; condicionada a estado==='borrador' + rol compras/admin.
  const [editando, setEditando]       = useState(false)
  const [todasLasAreas, setTodasLasAreas] = useState<Area[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [editProveedorId, setEditProveedorId] = useState('')
  const [editTipo, setEditTipo]       = useState<'precio_fijo' | 'precio_variable_tope'>('precio_fijo')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editFechaInicio, setEditFechaInicio] = useState('')
  const [editFechaFin, setEditFechaFin]       = useState('')
  const [editPresupuesto, setEditPresupuesto] = useState('')
  const [editReferencia, setEditReferencia]   = useState('')
  // Spec: HU-022 CA-02 — editable mientras la OCA está en borrador
  const [editModalidadFacturacion, setEditModalidadFacturacion] = useState<ModalidadFacturacion>('por_release')
  const [editAreas, setEditAreas]     = useState<string[]>([])
  const [editItems, setEditItems]     = useState<ItemForm[]>([{ ...ITEM_VACIO }])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  // Spec: HU-020 — enmiendas de la OCA
  const [enmiendas, setEnmiendas] = useState<Enmienda[]>([])
  const [modalSolicitar, setModalSolicitar] = useState(false)
  const [tipoEnmienda, setTipoEnmienda] = useState<TipoEnmienda>('incremento_presupuesto')
  const [enmJustificacion, setEnmJustificacion] = useState('')
  const [enmReferencia, setEnmReferencia] = useState('')
  const [enmMontoAdicional, setEnmMontoAdicional] = useState('')
  const [enmFechaFinNueva, setEnmFechaFinNueva] = useState('')
  const [enmModalidadNueva, setEnmModalidadNueva] = useState<ModalidadFacturacion>('por_release')
  const [enmItems, setEnmItems] = useState<ItemForm[]>([{ ...ITEM_VACIO }])
  const [enviandoEnmienda, setEnviandoEnmienda] = useState(false)
  const [errorEnmienda, setErrorEnmienda] = useState('')
  const [modalResolver, setModalResolver] = useState<{ enmienda: Enmienda; decision: 'aprobar' | 'rechazar' } | null>(null)
  const [motivoResolver, setMotivoResolver] = useState('')
  const [resolviendo, setResolviendo] = useState(false)

  // Spec: HU-021 — releases de la OCA
  const [releases, setReleases] = useState<Release[]>([])
  const [modalGenerarRelease, setModalGenerarRelease] = useState(false)
  const [relAreaId, setRelAreaId] = useState('')
  const [relObservaciones, setRelObservaciones] = useState('')
  const [relItems, setRelItems] = useState<ReleaseItemForm[]>([])
  const [generandoRelease, setGenerandoRelease] = useState(false)
  const [errorRelease, setErrorRelease] = useState('')
  const [modalResolverRelease, setModalResolverRelease] = useState<{ release: Release; decision: 'aprobar' | 'rechazar' } | null>(null)
  const [motivoResolverRelease, setMotivoResolverRelease] = useState('')
  const [resolviendoRelease, setResolviendoRelease] = useState(false)
  const [modalAnularRelease, setModalAnularRelease] = useState<Release | null>(null)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [anulando, setAnulando] = useState(false)

  // Spec: HU-022 CA-04/CA-05/CA-06 — marcar/desmarcar un release como facturado
  const [modalFacturar, setModalFacturar] = useState<Release | null>(null)
  const [numeroFactura, setNumeroFactura] = useState('')
  const [facturando, setFacturando] = useState(false)

  useEffect(() => {
    fetch('/api/auth/perfil').then(r => r.ok ? r.json() : null).then(p => setRol(p?.rol ?? null))
    fetch('/api/compras/areas').then(r => r.ok ? r.json() : []).then(data => setTodasLasAreas(Array.isArray(data) ? data : []))
    fetch('/api/compras/proveedores?activo=true&limit=200').then(r => r.ok ? r.json() : [])
      .then(data => setProveedores(data.proveedores ?? data ?? []))
  }, [])

  function iniciarEdicion() {
    if (!oca) return
    setEditProveedorId(oca.proveedor_id)
    setEditTipo(oca.tipo as 'precio_fijo' | 'precio_variable_tope')
    setEditDescripcion(oca.descripcion)
    setEditFechaInicio(oca.fecha_inicio)
    setEditFechaFin(oca.fecha_fin)
    setEditPresupuesto(String(oca.presupuesto_total))
    setEditReferencia(oca.referencia_contractual)
    setEditModalidadFacturacion(oca.modalidad_facturacion)
    setEditAreas(areasHab.map(a => a.id))
    setEditItems(items.length > 0
      ? items.map(it => ({
          codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad,
          categoria: it.categoria ?? '',
          precio_unitario: it.precio_unitario !== null ? String(it.precio_unitario) : '',
          precio_maximo: it.precio_maximo !== null ? String(it.precio_maximo) : '',
        }))
      : [{ ...ITEM_VACIO }])
    setErrorEdicion('')
    setEditando(true)
  }

  function actualizarEditItem(idx: number, campo: keyof ItemForm, valor: string) {
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))
  }

  function toggleEditArea(areaId: string) {
    setEditAreas(prev => prev.includes(areaId) ? prev.filter(a => a !== areaId) : [...prev, areaId])
  }

  async function handleGuardarEdicion() {
    setErrorEdicion('')
    if (!editProveedorId || !editDescripcion || !editFechaInicio || !editFechaFin || !editPresupuesto || !editReferencia) {
      setErrorEdicion('Completa todos los campos obligatorios de la cabecera'); return
    }
    setGuardandoEdicion(true)
    const res = await fetch(`/api/compras/ocas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: editProveedorId,
        tipo: editTipo,
        descripcion: editDescripcion,
        fecha_inicio: editFechaInicio,
        fecha_fin: editFechaFin,
        presupuesto_total: Number(editPresupuesto),
        referencia_contractual: editReferencia,
        modalidad_facturacion: editModalidadFacturacion,
        areas_habilitadas: editAreas,
        items: editItems.map(it => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          categoria: it.categoria || undefined,
          precio_unitario: editTipo === 'precio_fijo' ? Number(it.precio_unitario) : undefined,
          precio_maximo: editTipo === 'precio_variable_tope' ? Number(it.precio_maximo) : undefined,
        })),
      }),
    })
    const data = await res.json()
    setGuardandoEdicion(false)
    if (res.ok) { setEditando(false); cargar() } else { setErrorEdicion(data.error || 'Error al guardar') }
  }

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/ocas/${id}`)
      .then(r => r.json())
      .then(data => {
        setOca(data.oca); setItems(data.items ?? []); setAreasHab(data.areas_habilitadas ?? []); setHistorial(data.historial ?? [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
    fetch(`/api/compras/ocas/${id}/enmiendas`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setEnmiendas(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch(`/api/compras/ocas/${id}/releases`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setReleases(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  useEffect(() => { cargar() }, [id])

  const esComprasAdmin  = rol === 'compras' || rol === 'admin'
  const esGerenciaAdmin = rol === 'gerencia' || rol === 'admin'
  const puedeCerrar     = rol === 'compras' || rol === 'gerencia' || rol === 'admin'

  async function ejecutarAccion(endpoint: string, body?: Record<string, unknown>) {
    setProcesando(true); setError('')
    const res = await fetch(`/api/compras/ocas/${id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json()
    setProcesando(false)
    if (res.ok) {
      setModalAccion(null); setMotivo(''); cargar()
    } else {
      setError(data.error || 'Error al ejecutar la acción')
    }
  }

  // Spec: HU-020 RN-04/05/06 + HU-022 RN-03 — tipos elegibles según el estado actual de la OCA
  const tiposDisponibles: TipoEnmienda[] = oca
    ? [
        ...(['vigente', 'agotada'].includes(oca.estado) ? ['incremento_presupuesto' as const] : []),
        ...(['vigente', 'vencida'].includes(oca.estado) ? ['extension_plazo' as const] : []),
        ...(oca.estado === 'vigente' ? ['modificacion_precios' as const] : []),
        ...(oca.estado === 'vigente' ? ['cambio_modalidad_facturacion' as const] : []),
      ]
    : []
  const enmiendaPendiente = enmiendas.find(e => e.estado === 'pendiente') ?? null

  function abrirModalSolicitar() {
    setTipoEnmienda(tiposDisponibles[0] ?? 'incremento_presupuesto')
    setEnmJustificacion(''); setEnmReferencia(''); setEnmMontoAdicional(''); setEnmFechaFinNueva('')
    setEnmModalidadNueva('por_release')
    setEnmItems([{ ...ITEM_VACIO }])
    setErrorEnmienda('')
    setModalSolicitar(true)
  }

  async function handleSolicitarEnmienda() {
    setErrorEnmienda('')
    if (!enmJustificacion.trim() || !enmReferencia.trim()) {
      setErrorEnmienda('Justificación y referencia contractual son obligatorias'); return
    }
    const body: Record<string, unknown> = {
      tipo: tipoEnmienda, justificacion: enmJustificacion, referencia_contractual: enmReferencia,
    }
    if (tipoEnmienda === 'incremento_presupuesto') body.monto_adicional = Number(enmMontoAdicional)
    if (tipoEnmienda === 'extension_plazo') body.fecha_fin_nueva = enmFechaFinNueva
    if (tipoEnmienda === 'modificacion_precios') {
      body.items = enmItems.map(it => ({
        codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad,
        categoria: it.categoria || undefined,
        precio_unitario: oca?.tipo === 'precio_fijo' ? Number(it.precio_unitario) : undefined,
        precio_maximo: oca?.tipo === 'precio_variable_tope' ? Number(it.precio_maximo) : undefined,
      }))
    }
    if (tipoEnmienda === 'cambio_modalidad_facturacion') body.modalidad_facturacion_nueva = enmModalidadNueva

    setEnviandoEnmienda(true)
    const res = await fetch(`/api/compras/ocas/${id}/enmiendas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setEnviandoEnmienda(false)
    if (res.ok) { setModalSolicitar(false); cargar() } else { setErrorEnmienda(data.error || 'Error al solicitar la enmienda') }
  }

  async function handleResolverEnmienda() {
    if (!modalResolver) return
    if (modalResolver.decision === 'rechazar' && !motivoResolver.trim()) return
    setResolviendo(true)
    const res = await fetch(`/api/compras/ocas/${id}/enmiendas/${modalResolver.enmienda.id}/resolver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: modalResolver.decision, motivo: motivoResolver }),
    })
    setResolviendo(false)
    if (res.ok) { setModalResolver(null); setMotivoResolver(''); cargar() }
  }

  // Spec: HU-021 RN-01/CA-01/CA-02 — generación de release
  function abrirModalGenerarRelease() {
    setRelAreaId(areasHab[0]?.id ?? '')
    setRelObservaciones('')
    setRelItems(items.map(it => ({ oca_item_id: it.id, seleccionado: false, cantidad: '', precio_unitario: '' })))
    setErrorRelease('')
    setModalGenerarRelease(true)
  }

  function actualizarRelItem(ocaItemId: string, campo: keyof ReleaseItemForm, valor: string | boolean) {
    setRelItems(prev => prev.map(it => it.oca_item_id === ocaItemId ? { ...it, [campo]: valor } : it))
  }

  // Spec: CA-03 — preview informativo de monto_total (el cálculo real/autoritativo lo hace el backend)
  const relItemsSeleccionados = relItems.filter(it => it.seleccionado)
  const relMontoPreview = relItemsSeleccionados.reduce((sum, it) => {
    const itemCatalogo = items.find(i => i.id === it.oca_item_id)
    const precio = oca?.tipo === 'precio_fijo' ? (itemCatalogo?.precio_unitario ?? 0) : Number(it.precio_unitario || 0)
    return sum + precio * Number(it.cantidad || 0)
  }, 0)

  async function handleGenerarRelease() {
    setErrorRelease('')
    if (!relAreaId) { setErrorRelease('Selecciona un centro de costo'); return }
    if (relItemsSeleccionados.length === 0) { setErrorRelease('Selecciona al menos un ítem'); return }
    const body = {
      area_id: relAreaId,
      observaciones: relObservaciones || undefined,
      items: relItemsSeleccionados.map(it => ({
        oca_item_id: it.oca_item_id,
        cantidad: Number(it.cantidad),
        precio_unitario: oca?.tipo === 'precio_variable_tope' ? Number(it.precio_unitario) : undefined,
      })),
    }
    setGenerandoRelease(true)
    const res = await fetch(`/api/compras/ocas/${id}/releases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setGenerandoRelease(false)
    if (res.ok) { setModalGenerarRelease(false); cargar() } else { setErrorRelease(data.error || 'Error al generar el release') }
  }

  async function handleResolverRelease() {
    if (!modalResolverRelease) return
    if (modalResolverRelease.decision === 'rechazar' && !motivoResolverRelease.trim()) return
    setResolviendoRelease(true)
    const res = await fetch(`/api/compras/ocas/${id}/releases/${modalResolverRelease.release.id}/resolver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: modalResolverRelease.decision, motivo: motivoResolverRelease }),
    })
    const data = await res.json()
    setResolviendoRelease(false)
    if (res.ok) { setModalResolverRelease(null); setMotivoResolverRelease(''); cargar() }
    else { setError(data.error || 'Error al resolver el release') }
  }

  async function handleAnularRelease() {
    if (!modalAnularRelease || !motivoAnular.trim()) return
    setAnulando(true)
    const res = await fetch(`/api/compras/ocas/${id}/releases/${modalAnularRelease.id}/anular`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivoAnular }),
    })
    const data = await res.json()
    setAnulando(false)
    if (res.ok) { setModalAnularRelease(null); setMotivoAnular(''); cargar() }
    else { setError(data.error || 'Error al anular el release') }
  }

  // Spec: HU-022 CA-04/CA-05 — marcar un release aprobado como facturado
  async function handleFacturar() {
    if (!modalFacturar || !numeroFactura.trim()) return
    setFacturando(true)
    const res = await fetch(`/api/compras/ocas/${id}/releases/${modalFacturar.id}/facturar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero_factura: numeroFactura }),
    })
    const data = await res.json()
    setFacturando(false)
    if (res.ok) { setModalFacturar(null); setNumeroFactura(''); cargar() }
    else { setError(data.error || 'Error al facturar el release') }
  }

  // Spec: HU-022 CA-06 — desmarcar un release facturado (corrección administrativa)
  async function handleDesfacturar(release: Release) {
    setError('')
    const res = await fetch(`/api/compras/ocas/${id}/releases/${release.id}/facturar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facturado: false }),
    })
    const data = await res.json()
    if (res.ok) cargar()
    else setError(data.error || 'Error al desmarcar el release')
  }

  if (cargando) return <div className="text-center py-20 text-slate-400">Cargando...</div>
  if (!oca) return <div className="text-center py-20 text-slate-400">OCA no encontrada</div>

  // Spec: HU-021 — visibilidad de botones Aprobar/Rechazar/Anular en el cliente
  // es informativa (RN-02 real lo enforcea el backend por área/compras/admin);
  // se oculta solo para los roles explícitamente de solo lectura en todo el
  // sistema (gerencia/consulta) para no sugerir una acción que nunca procede.
  const puedeIntentarResolverRelease = rol !== null && !['gerencia', 'consulta'].includes(rol)
  const puedeGenerarRelease = rol !== null && ROLES_GENERAR_RELEASE.includes(rol)

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{oca.numero_oca}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{oca.descripcion}</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 font-medium">
              {ESTADO_LABEL[oca.estado] ?? oca.estado}
            </span>
            {oca.alerta_presupuesto && (
              <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${ALERTA_PRESUPUESTO_COLOR[oca.alerta_presupuesto]}`}>
                {oca.alerta_presupuesto}% del presupuesto
              </span>
            )}
            {oca.alerta_vigencia && (
              <span className="text-sm px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                Por vencer
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        {oca.motivo_rechazo && oca.estado === 'borrador' && (
          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm text-amber-800">
            <strong>Rechazada.</strong> Motivo: {oca.motivo_rechazo}
          </div>
        )}
        {oca.motivo_suspension && oca.estado === 'suspendida' && (
          <div className="bg-purple-50 border border-purple-200 rounded px-3 py-2 text-sm text-purple-800">
            <strong>Suspendida.</strong> Motivo: {oca.motivo_suspension}
          </div>
        )}
        {oca.motivo_cierre && oca.estado === 'cerrada' && (
          <div className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm text-slate-700">
            <strong>Cerrada.</strong> Motivo: {oca.motivo_cierre}
          </div>
        )}

        {editando ? (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Editar datos del acuerdo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Proveedor *</Label>
                    <select value={editProveedorId} onChange={e => setEditProveedorId(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                      <option value="">Seleccionar...</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo de OCA *</Label>
                    <select value={editTipo} onChange={e => setEditTipo(e.target.value as typeof editTipo)}
                      className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                      <option value="precio_fijo">Precio fijo</option>
                      <option value="precio_variable_tope">Precio variable (con tope)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Descripción *</Label>
                  <Input value={editDescripcion} onChange={e => setEditDescripcion(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Fecha de inicio *</Label>
                    <Input type="date" value={editFechaInicio} onChange={e => setEditFechaInicio(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha de fin *</Label>
                    <Input type="date" value={editFechaFin} onChange={e => setEditFechaFin(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Presupuesto total (USD) *</Label>
                    <Input type="number" min="0" step="0.01" value={editPresupuesto} onChange={e => setEditPresupuesto(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Referencia contractual *</Label>
                  <Input value={editReferencia} onChange={e => setEditReferencia(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Modalidad de facturación</Label>
                  <select value={editModalidadFacturacion} onChange={e => setEditModalidadFacturacion(e.target.value as ModalidadFacturacion)}
                    className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                    <option value="por_release">Por release</option>
                    <option value="mensual_consolidada">Mensual consolidada</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Áreas habilitadas</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {todasLasAreas.map(a => (
                      <button key={a.id} type="button" onClick={() => toggleEditArea(a.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border ${
                          editAreas.includes(a.id)
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}>
                        {a.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Lista de precios</CardTitle>
                  <Button variant="outline" className="text-xs h-7"
                    onClick={() => setEditItems(prev => [...prev, { ...ITEM_VACIO }])}>
                    + Agregar ítem
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {editItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end border-b pb-3 last:border-0">
                    <div>
                      <Label className="text-xs">Código</Label>
                      <Input value={it.codigo} onChange={e => actualizarEditItem(idx, 'codigo', e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Descripción</Label>
                      <Input value={it.descripcion} onChange={e => actualizarEditItem(idx, 'descripcion', e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Unidad</Label>
                      <Input value={it.unidad} onChange={e => actualizarEditItem(idx, 'unidad', e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    {editTipo === 'precio_fijo' ? (
                      <div>
                        <Label className="text-xs">Precio unitario</Label>
                        <Input type="number" min="0" step="0.01" value={it.precio_unitario}
                          onChange={e => actualizarEditItem(idx, 'precio_unitario', e.target.value)} className="mt-1 h-8 text-sm" />
                      </div>
                    ) : (
                      <div>
                        <Label className="text-xs">Precio máximo</Label>
                        <Input type="number" min="0" step="0.01" value={it.precio_maximo}
                          onChange={e => actualizarEditItem(idx, 'precio_maximo', e.target.value)} className="mt-1 h-8 text-sm" />
                      </div>
                    )}
                    <div className="flex items-end">
                      {editItems.length > 1 && (
                        <button type="button" onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:underline h-8">Quitar</button>
                      )}
                    </div>
                  </div>
                ))}
                {errorEdicion && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorEdicion}</p>}
                <div className="flex gap-3">
                  <Button className="btn-primary text-sm" disabled={guardandoEdicion} onClick={handleGuardarEdicion}>
                    {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                  <Button variant="outline" className="text-sm" onClick={() => setEditando(false)}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Información general</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Tipo:</span> {oca.tipo === 'precio_fijo' ? 'Precio fijo' : 'Precio variable (tope)'}</div>
                <div><span className="text-slate-500">Período:</span> {oca.fecha_inicio} – {oca.fecha_fin}</div>
                <div><span className="text-slate-500">Referencia contractual:</span> {oca.referencia_contractual}</div>
                <div><span className="text-slate-500">Modalidad de facturación:</span> {MODALIDAD_FACTURACION_LABEL[oca.modalidad_facturacion]}</div>
                <div><span className="text-slate-500">Áreas habilitadas:</span> {areasHab.map(a => a.nombre).join(', ') || '—'}</div>
                <div><span className="text-slate-500">Presupuesto total:</span> {usd(oca.presupuesto_total)}</div>
                <div><span className="text-slate-500">Consumido:</span> {usd(oca.consumido)}</div>
                <div><span className="text-slate-500">Disponible:</span> {usd(oca.disponible)}</div>
                <div><span className="text-slate-500">% Ejecución:</span> {oca.porcentaje_ejecucion}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Lista de precios</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-slate-500 text-xs uppercase">
                        <th className="text-left py-2 pr-4">Código</th>
                        <th className="text-left py-2 pr-4">Descripción</th>
                        <th className="text-left py-2 pr-4">Unidad</th>
                        <th className="text-right py-2">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{it.codigo}</td>
                          <td className="py-2 pr-4">{it.descripcion}</td>
                          <td className="py-2 pr-4">{it.unidad}</td>
                          <td className="py-2 text-right">
                            {it.precio_unitario !== null ? usd(it.precio_unitario) : it.precio_maximo !== null ? `≤ ${usd(it.precio_maximo)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Acciones</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {esComprasAdmin && oca.estado === 'borrador' && !editando && (
              <Button className="btn-primary text-sm" onClick={iniciarEdicion}>
                ✏️ Editar
              </Button>
            )}
            {esComprasAdmin && oca.estado === 'borrador' && (
              <Button className="text-sm" disabled={procesando} onClick={() => ejecutarAccion('enviar-aprobacion')}>
                📤 Enviar a aprobación
              </Button>
            )}
            {esGerenciaAdmin && oca.estado === 'en_aprobacion' && (
              <>
                <Button className="btn-primary text-sm" disabled={procesando} onClick={() => ejecutarAccion('aprobar', { decision: 'aprobar' })}>
                  ✓ Aprobar
                </Button>
                <Button variant="outline" className="text-sm text-red-600" onClick={() => setModalAccion('rechazar')}>
                  ✕ Rechazar
                </Button>
              </>
            )}
            {esGerenciaAdmin && oca.estado === 'vigente' && (
              <Button variant="outline" className="text-sm" onClick={() => setModalAccion('suspender')}>
                ⏸ Suspender
              </Button>
            )}
            {esGerenciaAdmin && oca.estado === 'suspendida' && (
              <Button className="text-sm" disabled={procesando} onClick={() => ejecutarAccion('reactivar')}>
                ▶ Reactivar
              </Button>
            )}
            {puedeCerrar && ESTADOS_NO_TERMINALES.includes(oca.estado) && (
              <Button variant="outline" className="text-sm text-slate-600" onClick={() => setModalAccion('cerrar')}>
                🔒 Cerrar
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Enmiendas</CardTitle>
              {esComprasAdmin && !enmiendaPendiente && tiposDisponibles.length > 0 && (
                <Button variant="outline" className="text-xs h-7" onClick={abrirModalSolicitar}>
                  + Solicitar enmienda
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              {enmiendas.length === 0 && <p className="text-slate-400">Sin enmiendas registradas.</p>}
              {enmiendas.map(e => (
                <div key={e.id} className="border-b last:border-0 pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-medium text-slate-700">{TIPO_ENMIENDA_LABEL[e.tipo]}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        e.estado === 'pendiente' ? 'bg-amber-100 text-amber-700'
                        : e.estado === 'aprobada' ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ESTADO_ENMIENDA_LABEL[e.estado]}
                      </span>
                    </div>
                    {esGerenciaAdmin && e.estado === 'pendiente' && (
                      <div className="flex gap-2">
                        <Button className="btn-primary text-xs h-7" onClick={() => setModalResolver({ enmienda: e, decision: 'aprobar' })}>
                          ✓ Aprobar
                        </Button>
                        <Button variant="outline" className="text-xs h-7 text-red-600" onClick={() => setModalResolver({ enmienda: e, decision: 'rechazar' })}>
                          ✕ Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    {e.tipo === 'incremento_presupuesto' && `Monto adicional: ${usd(e.monto_adicional ?? 0)}`}
                    {e.tipo === 'extension_plazo' && `Nueva fecha de fin: ${e.fecha_fin_nueva}`}
                    {e.tipo === 'modificacion_precios' && `${e.items_nuevos?.length ?? 0} ítem(s) propuestos`}
                    {e.tipo === 'cambio_modalidad_facturacion' && `Nueva modalidad: ${e.modalidad_facturacion_nueva ? MODALIDAD_FACTURACION_LABEL[e.modalidad_facturacion_nueva] : '—'}`}
                  </p>
                  <p className="text-slate-500 text-xs">Justificación: {e.justificacion}</p>
                  <p className="text-slate-500 text-xs">Referencia contractual: {e.referencia_contractual}</p>
                  {e.estado === 'rechazada' && e.motivo_rechazo && (
                    <p className="text-red-600 text-xs">Motivo de rechazo: {e.motivo_rechazo}</p>
                  )}
                  <p className="text-slate-400 text-xs mt-1">Solicitada: {new Date(e.solicitado_en).toLocaleString('es-EC')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Releases</CardTitle>
              {puedeGenerarRelease && oca.estado === 'vigente' && (
                <Button variant="outline" className="text-xs h-7" onClick={abrirModalGenerarRelease}>
                  + Generar release
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              {releases.length === 0 && <p className="text-slate-400">Sin releases generados.</p>}
              {releases.map(r => (
                <div key={r.id} className="border-b last:border-0 pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-medium text-slate-700">{r.numero_release}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        r.estado === 'pendiente_aprobacion' ? 'bg-amber-100 text-amber-700'
                        : r.estado === 'aprobado' ? 'bg-green-100 text-green-700'
                        : r.estado === 'anulado' ? 'bg-slate-200 text-slate-600'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {RELEASE_ESTADO_LABEL[r.estado]}
                      </span>
                      {r.estado === 'aprobado' && (
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                          r.facturado ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.facturado ? `Facturado (${r.numero_factura})` : 'No facturado'}
                        </span>
                      )}
                      {r.alerta_antiguedad && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Pendiente &gt; 24h
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {puedeIntentarResolverRelease && r.estado === 'pendiente_aprobacion' && (
                        <>
                          <Button className="btn-primary text-xs h-7" onClick={() => setModalResolverRelease({ release: r, decision: 'aprobar' })}>
                            ✓ Aprobar
                          </Button>
                          <Button variant="outline" className="text-xs h-7 text-red-600" onClick={() => setModalResolverRelease({ release: r, decision: 'rechazar' })}>
                            ✕ Rechazar
                          </Button>
                        </>
                      )}
                      {puedeIntentarResolverRelease && r.estado === 'aprobado' && (
                        <Button variant="outline" className="text-xs h-7 text-slate-600" onClick={() => setModalAnularRelease(r)}>
                          Anular
                        </Button>
                      )}
                      {/* Spec: HU-022 RN-04 — solo compras/admin, a diferencia del resto de acciones de release */}
                      {esComprasAdmin && r.estado === 'aprobado' && !r.facturado && (
                        <Button variant="outline" className="text-xs h-7 text-teal-700" onClick={() => { setModalFacturar(r); setNumeroFactura('') }}>
                          Marcar como facturado
                        </Button>
                      )}
                      {esComprasAdmin && r.estado === 'aprobado' && r.facturado && (
                        <Button variant="outline" className="text-xs h-7 text-slate-600" onClick={() => handleDesfacturar(r)}>
                          Desmarcar
                        </Button>
                      )}
                      {r.estado === 'aprobado' && (
                        <a href={`/api/compras/ocas/${id}/releases/${r.id}/pdf`} target="_blank" rel="noreferrer">
                          <Button variant="outline" className="text-xs h-7">⬇ PDF</Button>
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">Monto: {usd(r.monto_total)}</p>
                  {r.observaciones && <p className="text-slate-500 text-xs">Observaciones: {r.observaciones}</p>}
                  {r.estado === 'rechazado' && r.motivo_rechazo && (
                    <p className="text-red-600 text-xs">Motivo de rechazo: {r.motivo_rechazo}</p>
                  )}
                  {r.estado === 'anulado' && r.motivo_anulacion && (
                    <p className="text-slate-600 text-xs">Motivo de anulación: {r.motivo_anulacion}</p>
                  )}
                  <p className="text-slate-400 text-xs mt-1">Generado: {new Date(r.created_at).toLocaleString('es-EC')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Historial</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {historial.length === 0 && <p className="text-slate-400">Sin movimientos registrados.</p>}
              {historial.map(h => (
                <div key={h.id} className="border-b last:border-0 pb-2">
                  <span className="font-medium text-slate-700">{ESTADO_LABEL[h.estado] ?? h.estado}</span>
                  {' — '}
                  <span className="text-slate-500">{h.actor_nombre ?? h.actor_email ?? 'Sistema'}</span>
                  {h.notas && <p className="text-slate-500 text-xs">{h.notas}</p>}
                  <p className="text-slate-400 text-xs">{new Date(h.created_at).toLocaleString('es-EC')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {modalAccion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {modalAccion === 'rechazar' && 'Rechazar OCA'}
              {modalAccion === 'suspender' && 'Suspender OCA'}
              {modalAccion === 'cerrar' && 'Cerrar OCA'}
            </h3>
            <Label className="text-xs">Motivo *</Label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
            <div className="flex gap-3 mt-4">
              <Button
                className="btn-primary text-sm"
                disabled={procesando || !motivo.trim()}
                onClick={() => {
                  if (modalAccion === 'rechazar') ejecutarAccion('aprobar', { decision: 'rechazar', motivo })
                  if (modalAccion === 'suspender') ejecutarAccion('suspender', { motivo })
                  if (modalAccion === 'cerrar') ejecutarAccion('cerrar', { motivo })
                }}
              >
                {procesando ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalAccion(null); setMotivo('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalSolicitar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-3">Solicitar enmienda</h3>

            <Label className="text-xs">Tipo de enmienda *</Label>
            <select value={tipoEnmienda} onChange={e => setTipoEnmienda(e.target.value as TipoEnmienda)}
              className="w-full border rounded px-3 py-1.5 text-sm mt-1 mb-3">
              {tiposDisponibles.map(t => <option key={t} value={t}>{TIPO_ENMIENDA_LABEL[t]}</option>)}
            </select>

            {tipoEnmienda === 'incremento_presupuesto' && (
              <div className="mb-3">
                <Label className="text-xs">Monto adicional (USD) *</Label>
                <Input type="number" min="0" step="0.01" value={enmMontoAdicional}
                  onChange={e => setEnmMontoAdicional(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            )}

            {tipoEnmienda === 'extension_plazo' && (
              <div className="mb-3">
                <Label className="text-xs">Nueva fecha de fin *</Label>
                <Input type="date" value={enmFechaFinNueva}
                  onChange={e => setEnmFechaFinNueva(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            )}

            {tipoEnmienda === 'modificacion_precios' && (
              <div className="mb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Nueva lista de precios *</Label>
                  <Button variant="outline" className="text-xs h-7"
                    onClick={() => setEnmItems(prev => [...prev, { ...ITEM_VACIO }])}>
                    + Agregar ítem
                  </Button>
                </div>
                {enmItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end border-b pb-3 last:border-0">
                    <Input placeholder="Código" value={it.codigo} onChange={e => setEnmItems(prev => prev.map((p, i) => i === idx ? { ...p, codigo: e.target.value } : p))} className="h-8 text-sm" />
                    <Input placeholder="Descripción" value={it.descripcion} onChange={e => setEnmItems(prev => prev.map((p, i) => i === idx ? { ...p, descripcion: e.target.value } : p))} className="h-8 text-sm sm:col-span-2" />
                    <Input placeholder="Unidad" value={it.unidad} onChange={e => setEnmItems(prev => prev.map((p, i) => i === idx ? { ...p, unidad: e.target.value } : p))} className="h-8 text-sm" />
                    {oca.tipo === 'precio_fijo' ? (
                      <Input type="number" min="0" step="0.01" placeholder="Precio" value={it.precio_unitario}
                        onChange={e => setEnmItems(prev => prev.map((p, i) => i === idx ? { ...p, precio_unitario: e.target.value } : p))} className="h-8 text-sm" />
                    ) : (
                      <Input type="number" min="0" step="0.01" placeholder="Precio máx." value={it.precio_maximo}
                        onChange={e => setEnmItems(prev => prev.map((p, i) => i === idx ? { ...p, precio_maximo: e.target.value } : p))} className="h-8 text-sm" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {tipoEnmienda === 'cambio_modalidad_facturacion' && (
              <div className="mb-3">
                <Label className="text-xs">Nueva modalidad de facturación *</Label>
                <select value={enmModalidadNueva} onChange={e => setEnmModalidadNueva(e.target.value as ModalidadFacturacion)}
                  className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                  <option value="por_release">Por release</option>
                  <option value="mensual_consolidada">Mensual consolidada</option>
                </select>
              </div>
            )}

            <Label className="text-xs">Justificación *</Label>
            <textarea value={enmJustificacion} onChange={e => setEnmJustificacion(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1 mb-3" rows={2} />

            <Label className="text-xs">Referencia contractual *</Label>
            <Input value={enmReferencia} onChange={e => setEnmReferencia(e.target.value)} className="mt-1 h-8 text-sm" />

            {errorEnmienda && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{errorEnmienda}</p>}

            <div className="flex gap-3 mt-4">
              <Button className="btn-primary text-sm" disabled={enviandoEnmienda} onClick={handleSolicitarEnmienda}>
                {enviandoEnmienda ? 'Enviando...' : 'Solicitar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => setModalSolicitar(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {modalResolver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {modalResolver.decision === 'aprobar' ? 'Aprobar enmienda' : 'Rechazar enmienda'}
            </h3>
            <p className="text-slate-500 text-sm mb-3">{TIPO_ENMIENDA_LABEL[modalResolver.enmienda.tipo]}</p>
            {modalResolver.decision === 'rechazar' && (
              <>
                <Label className="text-xs">Motivo *</Label>
                <textarea value={motivoResolver} onChange={e => setMotivoResolver(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
              </>
            )}
            <div className="flex gap-3 mt-4">
              <Button
                className="btn-primary text-sm"
                disabled={resolviendo || (modalResolver.decision === 'rechazar' && !motivoResolver.trim())}
                onClick={handleResolverEnmienda}
              >
                {resolviendo ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalResolver(null); setMotivoResolver('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalGenerarRelease && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-3">Generar release</h3>

            <Label className="text-xs">Centro de costo *</Label>
            <select value={relAreaId} onChange={e => setRelAreaId(e.target.value)}
              className="w-full border rounded px-3 py-1.5 text-sm mt-1 mb-3">
              <option value="">Seleccionar...</option>
              {areasHab.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>

            <Label className="text-xs">Ítems *</Label>
            <div className="space-y-2 mt-1 mb-3">
              {relItems.map(it => {
                const itemCatalogo = items.find(i => i.id === it.oca_item_id)
                if (!itemCatalogo) return null
                return (
                  <div key={it.oca_item_id} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center border-b pb-2 last:border-0">
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <input type="checkbox" checked={it.seleccionado}
                        onChange={e => actualizarRelItem(it.oca_item_id, 'seleccionado', e.target.checked)} />
                      <span className="text-sm">{itemCatalogo.codigo} — {itemCatalogo.descripcion} ({itemCatalogo.unidad})</span>
                    </div>
                    <Input type="number" min="0" step="0.01" placeholder="Cantidad" disabled={!it.seleccionado}
                      value={it.cantidad} onChange={e => actualizarRelItem(it.oca_item_id, 'cantidad', e.target.value)}
                      className="h-8 text-sm" />
                    {oca.tipo === 'precio_variable_tope' ? (
                      <Input type="number" min="0" step="0.01" placeholder={`Precio (≤ ${itemCatalogo.precio_maximo ?? '—'})`} disabled={!it.seleccionado}
                        value={it.precio_unitario} onChange={e => actualizarRelItem(it.oca_item_id, 'precio_unitario', e.target.value)}
                        className="h-8 text-sm" />
                    ) : (
                      <span className="text-sm text-slate-500">{usd(itemCatalogo.precio_unitario ?? 0)} c/u</span>
                    )}
                  </div>
                )
              })}
            </div>

            <Label className="text-xs">Observaciones</Label>
            <textarea value={relObservaciones} onChange={e => setRelObservaciones(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1 mb-3" rows={2} />

            <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm mb-3">
              <span className="text-slate-500">Monto estimado del release:</span> <strong>{usd(relMontoPreview)}</strong>
              <span className="text-slate-400 text-xs ml-2">(informativo — el presupuesto se verifica al aprobar)</span>
            </div>

            {errorRelease && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{errorRelease}</p>}

            <div className="flex gap-3">
              <Button className="btn-primary text-sm" disabled={generandoRelease} onClick={handleGenerarRelease}>
                {generandoRelease ? 'Generando...' : 'Generar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => setModalGenerarRelease(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {modalResolverRelease && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {modalResolverRelease.decision === 'aprobar' ? 'Aprobar release' : 'Rechazar release'}
            </h3>
            <p className="text-slate-500 text-sm mb-3">{modalResolverRelease.release.numero_release} — {usd(modalResolverRelease.release.monto_total)}</p>
            {modalResolverRelease.decision === 'rechazar' && (
              <>
                <Label className="text-xs">Motivo *</Label>
                <textarea value={motivoResolverRelease} onChange={e => setMotivoResolverRelease(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
              </>
            )}
            <div className="flex gap-3 mt-4">
              <Button
                className="btn-primary text-sm"
                disabled={resolviendoRelease || (modalResolverRelease.decision === 'rechazar' && !motivoResolverRelease.trim())}
                onClick={handleResolverRelease}
              >
                {resolviendoRelease ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalResolverRelease(null); setMotivoResolverRelease('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalAnularRelease && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Anular release</h3>
            <p className="text-slate-500 text-sm mb-3">{modalAnularRelease.numero_release} — {usd(modalAnularRelease.monto_total)}</p>
            <Label className="text-xs">Motivo *</Label>
            <textarea value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
            <div className="flex gap-3 mt-4">
              <Button className="btn-primary text-sm" disabled={anulando || !motivoAnular.trim()} onClick={handleAnularRelease}>
                {anulando ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalAnularRelease(null); setMotivoAnular('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalFacturar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Marcar release como facturado</h3>
            <p className="text-slate-500 text-sm mb-3">{modalFacturar.numero_release} — {usd(modalFacturar.monto_total)}</p>
            <Label className="text-xs">Número de factura *</Label>
            <Input value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} className="mt-1 h-8 text-sm" />
            <div className="flex gap-3 mt-4">
              <Button className="btn-primary text-sm" disabled={facturando || !numeroFactura.trim()} onClick={handleFacturar}>
                {facturando ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalFacturar(null); setNumeroFactura('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
