'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type OC = {
  id: string
  numero_oc: string
  numero_np: string | null
  nota_pedido_id: string | null
  proveedor: string
  proveedor_id: string | null
  fecha_np: string | null
  fecha_oc: string | null
  descripcion_oc: string | null
  area: string | null
  tipo_compra: string | null
  centro_costo: string | null
  numero_factura: string | null
  fecha_factura: string | null
  valor_total: number
  valor_retenido: number
  valor_a_pagar: number
  banco: string | null
  tipo_pago: string | null
  mes_pago: string | null
  dias_credito: number
  fecha_vencimiento: string | null
  estado_oc: string
  created_at: string
}

type ItemOC = {
  id?: string
  linea: number
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number | string
  precio_unitario: number | string
}

type Proveedor = {
  id: string; nombre: string; clasificacion: string | null
  categoria: string | null; ciudad: string | null
  telefono: string | null; email: string | null; contacto: string | null
}

type InvItem = {
  id: string; codigo: string; descripcion: string
  costo_unitario: number; saldo_existencias: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS = ['en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras', 'rechazada', 'aprobada']

const ESTADO_LABEL: Record<string, string> = {
  en_proceso:               'En Proceso',
  en_aprobacion_gerencia:   'Aprobación Gerencia',
  en_aprobacion_compras:    'Aprobación Compras',
  rechazada:                'Rechazada',
  aprobada:                 'Aprobada',
}

const ESTADO_BADGE: Record<string, string> = {
  en_proceso:               'bg-yellow-100 text-yellow-800',
  en_aprobacion_gerencia:   'bg-purple-100 text-purple-800',
  en_aprobacion_compras:    'bg-blue-100 text-blue-800',
  rechazada:                'bg-red-100 text-red-800',
  aprobada:                 'bg-green-100 text-green-800',
}

const UNIDADES = ['EA', 'UN', 'M', 'ML', 'KG', 'LT', 'GL', 'M2', 'M3', 'JGO', 'RLL', 'CJA', 'PAR', 'HRS']

const AREAS = [
  'Operaciones - Bombeo Mecánico', 'Operaciones - Servicio Eléctrico', 'Operaciones - Niveles',
  'Compras', 'QHSE', 'TTHH', 'Finanzas', 'Gerencia', 'Ventas',
]

// ─── Autocomplete proveedor ───────────────────────────────────────────────────

function ProveedorSearch({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void; onSelect: (p: Proveedor) => void
}) {
  const [resultados, setResultados] = useState<Proveedor[]>([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/proveedores?q=${encodeURIComponent(val)}`)
        setResultados(await res.json())
        setAbierto(true)
      } finally { setCargando(false) }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative mt-1">
      <Input value={value} onChange={e => handleInput(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Busca por nombre, categoría o contacto..." className="h-8 text-sm" />
      {cargando && <span className="absolute right-2 top-2 text-xs text-slate-400">buscando...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
          )}
          {resultados.map(p => (
            <li key={p.id} onMouseDown={() => { onSelect(p); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{p.nombre}</span>
                {p.clasificacion && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    p.clasificacion === 'CRITICO' ? 'bg-red-100 text-red-700' :
                    p.clasificacion === 'NO CRITICO' ? 'bg-green-100 text-green-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{p.clasificacion}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                {p.categoria && <span>{p.categoria}</span>}
                {p.ciudad    && <span>· {p.ciudad}</span>}
                {p.contacto  && <span>· {p.contacto}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Autocomplete inventario ──────────────────────────────────────────────────

function InventarioSearch({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void; onSelect: (i: InvItem) => void
}) {
  const [resultados, setResultados] = useState<InvItem[]>([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/inventario/search?q=${encodeURIComponent(val)}`)
        setResultados(await res.json())
        setAbierto(true)
      } finally { setCargando(false) }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input value={value} onChange={e => handleInput(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Descripción o código AL-I..." className="h-7 text-xs min-w-[180px]" />
      {cargando && <span className="absolute right-2 top-1.5 text-xs text-slate-400">...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-72 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
          )}
          {resultados.map(item => (
            <li key={item.id} onMouseDown={() => { onSelect(item); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-xs text-slate-400 mr-1">{item.codigo}</span>
                <span className="text-slate-800 text-xs">{item.descripcion}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="text-xs text-green-600">Stock: {Number(item.saldo_existencias ?? 0).toFixed(0)}</span>
                {item.costo_unitario > 0 && <span className="text-xs text-blue-600">${Number(item.costo_unitario).toFixed(2)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DetalleOCPage() {
  const params = useParams()
  const id     = params.id as string

  const [oc, setOc]             = useState<OC | null>(null)
  const [items, setItems]       = useState<ItemOC[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Edición
  const [editando, setEditando]       = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [errorEdit, setErrorEdit]     = useState('')
  const [proveedorId, setProveedorId] = useState<string | null>(null)
  const [form, setForm]               = useState<Record<string, string>>({})
  const [itemsEdit, setItemsEdit]     = useState<ItemOC[]>([])

  // Cambio de estado
  const [cambiandoEstado, setCambiandoEstado]   = useState(false)
  const [nuevoEstado, setNuevoEstado]           = useState('')
  const [guardandoEstado, setGuardandoEstado]   = useState(false)

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/ordenes/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorMsg(data.error); setCargando(false); return }
        setOc(data.oc)
        setItems(data.items)
        setNuevoEstado(data.oc.estado_oc)
        setCargando(false)
      })
      .catch(() => { setErrorMsg('Error de conexión'); setCargando(false) })
  }

  useEffect(() => { cargar() }, [id])

  function iniciarEdicion() {
    if (!oc) return
    setForm({
      proveedor:         oc.proveedor,
      fecha_oc:          oc.fecha_oc?.slice(0, 10) ?? '',
      descripcion_oc:    oc.descripcion_oc ?? '',
      area:              oc.area ?? '',
      tipo_compra:       oc.tipo_compra ?? '',
      centro_costo:      oc.centro_costo ?? '',
      numero_factura:    oc.numero_factura ?? '',
      fecha_factura:     oc.fecha_factura?.slice(0, 10) ?? '',
      valor_retenido:    String(oc.valor_retenido),
      tipo_pago:         oc.tipo_pago ?? '',
      banco:             oc.banco ?? '',
      dias_credito:      String(oc.dias_credito),
      fecha_vencimiento: oc.fecha_vencimiento?.slice(0, 10) ?? '',
      mes_pago:          oc.mes_pago ?? '',
    })
    setProveedorId(oc.proveedor_id)
    setItemsEdit(items.map(i => ({ ...i, cantidad: String(i.cantidad), precio_unitario: String(i.precio_unitario) })))
    setEditando(true)
    setErrorEdit('')
  }

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  function setItemEdit(i: number, key: keyof ItemOC, val: string) {
    setItemsEdit(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  }

  function agregarItem() {
    setItemsEdit(prev => [...prev, { codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0', linea: prev.length + 1 }])
  }

  function eliminarItem(i: number) { setItemsEdit(prev => prev.filter((_, idx) => idx !== i)) }

  const totalEdit       = itemsEdit.reduce((acc, it) => acc + (parseFloat(String(it.cantidad)) || 0) * (parseFloat(String(it.precio_unitario)) || 0), 0)
  const valorRetenidoEdit = Number(form.valor_retenido) || 0

  async function handleGuardar() {
    if (!form.proveedor?.trim()) { setErrorEdit('El proveedor es requerido'); return }
    if (itemsEdit.length === 0)  { setErrorEdit('La OC debe tener al menos un ítem'); return }
    if (itemsEdit.some(i => !String(i.descripcion).trim())) { setErrorEdit('Todos los ítems deben tener descripción'); return }

    setGuardando(true); setErrorEdit('')
    try {
      const res = await fetch(`/api/compras/ordenes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          proveedor_id: proveedorId,
          valor_total:  totalEdit,
          items: itemsEdit.map(i => ({
            codigo:          i.codigo || null,
            descripcion:     i.descripcion,
            unidad:          i.unidad,
            cantidad:        Number(i.cantidad) || 0,
            precio_unitario: Number(i.precio_unitario) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditando(false)
        cargar()
      } else {
        setErrorEdit(data.error || 'Error al guardar')
      }
    } catch { setErrorEdit('Error de conexión') }
    finally  { setGuardando(false) }
  }

  async function handleCambiarEstado() {
    if (!nuevoEstado || nuevoEstado === oc?.estado_oc) return
    setGuardandoEstado(true)
    try {
      const res  = await fetch(`/api/compras/ordenes/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      const data = await res.json()
      if (data.success) {
        setCambiandoEstado(false)
        cargar()
      }
    } finally { setGuardandoEstado(false) }
  }

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>
  if (errorMsg || !oc) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="text-center space-y-3">
        <p>{errorMsg || 'OC no encontrada'}</p>
        <Link href="/compras/ordenes" className="text-blue-600 text-sm hover:underline">← Volver</Link>
      </div>
    </div>
  )

  const totalOC = items.reduce((acc, i) => acc + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/compras/ordenes" className="text-blue-300 text-xs hover:text-white">← Órdenes de Compra</Link>
            <h1 className="text-xl font-bold mt-1">{oc.numero_oc}</h1>
            {oc.numero_np && (
              <p className="text-blue-300 text-xs mt-0.5">
                Originada de{' '}
                <Link href={`/compras/${oc.nota_pedido_id}`} className="underline hover:text-white">{oc.numero_np}</Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${ESTADO_BADGE[oc.estado_oc] ?? 'bg-slate-100 text-slate-700'}`}>
              {ESTADO_LABEL[oc.estado_oc] ?? oc.estado_oc}
            </span>
            {!editando && (
              <Button onClick={iniciarEdicion} className="bg-white/10 hover:bg-white/20 text-white text-sm">
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Cambio de estado */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-slate-700">Estado:</span>
              {!cambiandoEstado ? (
                <>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[oc.estado_oc] ?? ''}`}>
                    {ESTADO_LABEL[oc.estado_oc] ?? oc.estado_oc}
                  </span>
                  <button onClick={() => setCambiandoEstado(true)} className="text-xs text-blue-600 hover:underline">Cambiar estado</button>
                </>
              ) : (
                <>
                  <select
                    value={nuevoEstado}
                    onChange={e => setNuevoEstado(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ESTADOS.map(e => (
                      <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                    ))}
                  </select>
                  <Button onClick={handleCambiarEstado} disabled={guardandoEstado || nuevoEstado === oc.estado_oc} className="h-8 btn-primary text-sm">
                    {guardandoEstado ? 'Guardando...' : 'Confirmar'}
                  </Button>
                  <button onClick={() => { setCambiandoEstado(false); setNuevoEstado(oc.estado_oc) }} className="text-xs text-slate-500 hover:underline">Cancelar</button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vista detalle (sin edición) */}
        {!editando && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-700">Datos de la Orden</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-slate-500">Proveedor</p><p className="font-medium">{oc.proveedor}</p></div>
                  <div><p className="text-xs text-slate-500">Fecha OC</p><p className="font-medium">{oc.fecha_oc ? new Date(oc.fecha_oc).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Área</p><p className="font-medium">{oc.area ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Tipo de Compra</p><p className="font-medium capitalize">{oc.tipo_compra ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Centro de Costo</p><p className="font-medium">{oc.centro_costo ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Tipo de Pago</p><p className="font-medium capitalize">{oc.tipo_pago ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">N° Factura</p><p className="font-medium">{oc.numero_factura ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Fecha Factura</p><p className="font-medium">{oc.fecha_factura ? new Date(oc.fecha_factura).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Banco</p><p className="font-medium">{oc.banco ?? '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Días Crédito</p><p className="font-medium">{oc.dias_credito}</p></div>
                  <div><p className="text-xs text-slate-500">Fecha Vencimiento</p><p className="font-medium">{oc.fecha_vencimiento ? new Date(oc.fecha_vencimiento).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                  <div><p className="text-xs text-slate-500">Mes de Pago</p><p className="font-medium">{oc.mes_pago ?? '—'}</p></div>
                </div>
                {oc.descripcion_oc && (
                  <div className="mt-4 bg-slate-50 rounded-md p-3 text-sm">
                    <p className="text-xs text-slate-500 mb-1">DESCRIPCIÓN</p>
                    <p>{oc.descripcion_oc}</p>
                  </div>
                )}
                {/* Totales */}
                <div className="mt-4 bg-slate-50 rounded-md p-3 text-sm flex flex-col gap-1">
                  <div className="flex justify-between"><span className="text-slate-500">Total OC</span><span className="font-medium">${Number(oc.valor_total).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Retención</span><span className="font-medium text-red-600">- ${Number(oc.valor_retenido).toFixed(2)}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Valor a Pagar</span><span className="font-bold text-blue-700">${Number(oc.valor_a_pagar).toFixed(2)}</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-700">Ítems</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-slate-500 uppercase">
                        <th className="text-left py-2 pr-3">#</th>
                        <th className="text-left py-2 pr-3">Código</th>
                        <th className="text-left py-2 pr-3">Descripción</th>
                        <th className="text-center py-2 pr-3">Cantidad</th>
                        <th className="text-right py-2 pr-3">P. Unit.</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 text-slate-500">{item.linea}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-slate-400">{item.codigo || '—'}</td>
                          <td className="py-2 pr-3">{item.descripcion}</td>
                          <td className="py-2 pr-3 text-center">{item.cantidad} {item.unidad}</td>
                          <td className="py-2 pr-3 text-right">${Number(item.precio_unitario).toFixed(2)}</td>
                          <td className="py-2 text-right font-medium">${((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="py-2 pr-3 text-right font-semibold">Total</td>
                        <td className="py-2 text-right font-bold text-blue-700">${totalOC.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Formulario de edición */}
        {editando && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Editando {oc.numero_oc}</CardTitle>
                <button onClick={() => setEditando(false)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Ítems */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700">Ítems</p>
                  <button type="button" onClick={agregarItem} className="text-xs text-blue-600 hover:underline font-medium">+ Agregar ítem</button>
                </div>
                <div className="space-y-2">
                  {itemsEdit.map((item, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-slate-500">Descripción *</Label>
                            <a href="/compras/inventario/nuevo" target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline">
                              ¿No existe? Crear ítem →
                            </a>
                          </div>
                          <InventarioSearch
                            value={String(item.descripcion)}
                            onChange={val => setItemEdit(i, 'descripcion', val)}
                            onSelect={inv => setItemsEdit(prev => prev.map((it, idx) => idx === i ? {
                              ...it,
                              descripcion:     inv.descripcion,
                              codigo:          inv.codigo,
                              precio_unitario: inv.costo_unitario > 0 ? String(inv.costo_unitario) : String(it.precio_unitario),
                            } : it))}
                          />
                        </div>
                        {itemsEdit.length > 1 && (
                          <button type="button" onClick={() => eliminarItem(i)} className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
                        )}
                      </div>
                      <div className="flex items-end gap-2 flex-wrap pl-7">
                        <div>
                          <Label className="text-xs text-slate-500">Código</Label>
                          <Input value={String(item.codigo)} onChange={e => setItemEdit(i, 'codigo', e.target.value)} className="h-7 text-xs font-mono w-28 mt-0.5" placeholder="AL-I-0000" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Unidad</Label>
                          <select value={item.unidad} onChange={e => setItemEdit(i, 'unidad', e.target.value)} className="mt-0.5 h-7 rounded-md border border-input bg-background px-1 text-xs w-16 block">
                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Cantidad</Label>
                          <Input type="number" step="0.01" min="0" value={String(item.cantidad)} onChange={e => setItemEdit(i, 'cantidad', e.target.value)} className="h-7 text-xs w-20 mt-0.5" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">P. Unit. USD</Label>
                          <Input type="number" step="0.01" min="0" value={String(item.precio_unitario)} onChange={e => setItemEdit(i, 'precio_unitario', e.target.value)} className="h-7 text-xs w-24 mt-0.5" />
                        </div>
                        <div className="ml-auto text-right">
                          <Label className="text-xs text-slate-500">Total</Label>
                          <p className="text-sm font-bold text-blue-700 mt-0.5">
                            ${((parseFloat(String(item.cantidad)) || 0) * (parseFloat(String(item.precio_unitario)) || 0)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1 border-t">
                    <span className="text-sm text-slate-500">Total OC:</span>
                    <span className="ml-2 text-lg font-bold text-blue-700">${totalEdit.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Datos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Proveedor *</Label>
                  <ProveedorSearch
                    value={form.proveedor ?? ''}
                    onChange={val => { setField('proveedor', val); setProveedorId(null) }}
                    onSelect={p => { setField('proveedor', p.nombre); setProveedorId(p.id) }}
                  />
                  <div className="flex items-center justify-between mt-1">
                    {proveedorId
                      ? <p className="text-xs text-green-600">✓ Proveedor registrado seleccionado</p>
                      : <p className="text-xs text-slate-400">Escribe para buscar en el registro de proveedores</p>
                    }
                    <a href="/compras/proveedores/nueva" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline shrink-0 ml-2">
                      ¿No existe? Crear proveedor →
                    </a>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Número de OC</Label>
                  <div className="mt-1 h-8 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-mono text-blue-700 font-medium">
                    {oc.numero_oc}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Fecha OC</Label>
                  <Input type="date" value={form.fecha_oc ?? ''} onChange={e => setField('fecha_oc', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Área</Label>
                  <select value={form.area ?? ''} onChange={e => setField('area', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Selecciona...</option>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo de Compra</Label>
                  <select value={form.tipo_compra ?? ''} onChange={e => setField('tipo_compra', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Selecciona...</option>
                    <option value="bienes">Bienes</option>
                    <option value="servicios">Servicios</option>
                    <option value="obra">Obra</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Centro de Costo</Label>
                  <Input value={form.centro_costo ?? ''} onChange={e => setField('centro_costo', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Tipo de Pago</Label>
                  <select value={form.tipo_pago ?? ''} onChange={e => setField('tipo_pago', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Selecciona...</option>
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                    <option value="anticipado">Anticipado</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Número de Factura</Label>
                  <Input value={form.numero_factura ?? ''} onChange={e => setField('numero_factura', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Fecha Factura</Label>
                  <Input type="date" value={form.fecha_factura ?? ''} onChange={e => setField('fecha_factura', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Valor Retenido USD</Label>
                  <Input type="number" step="0.01" value={form.valor_retenido ?? '0'} onChange={e => setField('valor_retenido', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Banco</Label>
                  <Input value={form.banco ?? ''} onChange={e => setField('banco', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Días Crédito</Label>
                  <Input type="number" value={form.dias_credito ?? '0'} onChange={e => setField('dias_credito', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Fecha Vencimiento</Label>
                  <Input type="date" value={form.fecha_vencimiento ?? ''} onChange={e => setField('fecha_vencimiento', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Mes de Pago</Label>
                  <Input value={form.mes_pago ?? ''} onChange={e => setField('mes_pago', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Ej: Enero 2026" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Descripción OC</Label>
                <Textarea value={form.descripcion_oc ?? ''} onChange={e => setField('descripcion_oc', e.target.value)} className="mt-1 text-sm min-h-[60px]" />
              </div>

              <div className="bg-slate-50 rounded-md p-3 text-sm flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-slate-500">Total OC</span><span className="font-medium">${totalEdit.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Retención</span><span className="font-medium text-red-600">- ${valorRetenidoEdit.toFixed(2)}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Valor a Pagar</span><span className="font-bold text-blue-700">${(totalEdit - valorRetenidoEdit).toFixed(2)}</span></div>
              </div>

              {errorEdit && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorEdit}</p>}

              <div className="flex gap-3">
                <Button onClick={handleGuardar} disabled={guardando} className="flex-1 btn-primary">
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
                <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
