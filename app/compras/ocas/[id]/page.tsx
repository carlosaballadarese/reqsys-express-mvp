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
type Oca = {
  id: string; numero_oca: string; proveedor_id: string; tipo: string
  descripcion: string; fecha_inicio: string; fecha_fin: string
  presupuesto_total: number; referencia_contractual: string; estado: string
  consumido: number; disponible: number; porcentaje_ejecucion: number
  motivo_rechazo: string | null; motivo_suspension: string | null; motivo_cierre: string | null
}
type Proveedor = { id: string; nombre: string }
type ItemForm = {
  codigo: string; descripcion: string; unidad: string; categoria: string
  precio_unitario: string; precio_maximo: string
}
const ITEM_VACIO: ItemForm = { codigo: '', descripcion: '', unidad: '', categoria: '', precio_unitario: '', precio_maximo: '' }

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_aprobacion: 'En aprobación', vigente: 'Vigente',
  suspendida: 'Suspendida', agotada: 'Agotada', vencida: 'Vencida', cerrada: 'Cerrada',
}
const ESTADOS_NO_TERMINALES = ['vigente', 'suspendida', 'agotada', 'vencida']

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
  const [editAreas, setEditAreas]     = useState<string[]>([])
  const [editItems, setEditItems]     = useState<ItemForm[]>([{ ...ITEM_VACIO }])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

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

  if (cargando) return <div className="text-center py-20 text-slate-400">Cargando...</div>
  if (!oca) return <div className="text-center py-20 text-slate-400">OCA no encontrada</div>

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{oca.numero_oca}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{oca.descripcion}</p>
          </div>
          <span className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 font-medium">
            {ESTADO_LABEL[oca.estado] ?? oca.estado}
          </span>
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
    </div>
  )
}
