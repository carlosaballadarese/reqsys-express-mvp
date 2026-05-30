'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NP = {
  id: string
  numero: string
  solicitante_nombre: string
  solicitante_email: string
  area: string
  prioridad: string
  tipo_compra: string
  centro_costo: string
  descripcion_general: string
  estado: string
  total_estimado: number
  convertida: boolean
  motivo_rechazo: string | null
  motivo_devolucion: string | null
  created_at: string
  asignado_a:      string | null
  asignado_nombre: string | null
  asignado_email:  string | null
  creado_por_id:   string | null
}

type OCVinculada = {
  id: string
  numero_oc: string
  proveedor: string
  valor_total: number
  estado_oc: string
  fecha_oc: string | null
  creado_por_nombre: string | null
}

type Asistente = { id: string; nombre: string; email: string }

const ESTADO_OC_BADGE: Record<string, string> = {
  en_proceso:             'bg-yellow-100 text-yellow-800',
  en_aprobacion_compras:  'bg-blue-100 text-blue-800',
  en_aprobacion_gerencia: 'bg-purple-100 text-purple-800',
  aprobada:               'bg-green-100 text-green-800',
  rechazada:              'bg-red-100 text-red-800',
}

const ESTADO_OC_LABEL: Record<string, string> = {
  en_proceso:             'En Proceso',
  en_aprobacion_compras:  'Aprobación Compras',
  en_aprobacion_gerencia: 'Aprobación Gerencia',
  aprobada:               'Aprobada',
  rechazada:              'Rechazada',
}

type Item = {
  id: string
  linea: number
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number | null
  total: number
  proveedor_sugerido: string | null
}

type Historial = {
  id: string
  estado: string
  actor_nombre: string | null
  actor_email: string | null
  notas: string | null
  fecha: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
  pendiente:     'bg-yellow-100 text-yellow-800',
  aprobada:      'bg-green-100 text-green-800',
  rechazada:     'bg-red-100 text-red-800',
  devuelta:      'bg-amber-100 text-amber-800',
  convertida:    'bg-blue-100 text-blue-800',
  completada:    'bg-teal-100 text-teal-800',
  reabierta:     'bg-purple-100 text-purple-800',
  reenviada:     'bg-indigo-100 text-indigo-800',
  asignacion:    'bg-cyan-100 text-cyan-800',
  reasignacion:  'bg-cyan-100 text-cyan-800',
  toma_control:  'bg-purple-100 text-purple-800',
}

const HISTORIAL_ICON: Record<string, string> = {
  pendiente:    '📋',
  aprobada:     '✅',
  rechazada:    '❌',
  devuelta:     '↩',
  convertida:   '🛒',
  completada:   '🏁',
  reabierta:    '🔓',
  reenviada:    '↗',
  asignacion:   '👤',
  reasignacion: '🔄',
  toma_control: '🎯',
}

const HISTORIAL_LABEL: Record<string, string> = {
  asignacion:   'Asignación',
  reasignacion: 'Reasignación',
  toma_control: 'Toma de control',
  completada:   'Completada',
  reabierta:    'Reabierta',
  reenviada:    'Reenviada',
}

function usd(n: number) {
  return `$${Number(n).toFixed(2)}`
}

// ─── Autocomplete proveedores ────────────────────────────────────────────────

type Proveedor = {
  id: string
  nombre: string
  clasificacion: string | null
  categoria: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
}

function ProveedorSearch({ value, onChange, onSelect }: {
  value: string
  onChange: (val: string) => void
  onSelect: (p: Proveedor) => void
}) {
  const [resultados, setResultados] = useState<Proveedor[]>([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/compras/proveedores?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(data)
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative mt-1">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Busca por nombre, categoría o contacto..."
        className="h-8 text-sm"
      />
      {cargando && <span className="absolute right-2 top-2 text-xs text-slate-400">buscando...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
          )}
          {resultados.map(p => (
            <li
              key={p.id}
              onMouseDown={() => { onSelect(p); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0"
            >
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
                {p.ciudad && <span>· {p.ciudad}</span>}
                {p.contacto && <span>· {p.contacto}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Autocomplete inventario ─────────────────────────────────────────────────

type InvItem = {
  id: string
  codigo: string
  descripcion: string
  costo_unitario: number
  saldo_existencias: number
}

function InventarioSearch({ value, onChange, onSelect }: {
  value: string
  onChange: (val: string) => void
  onSelect: (item: InvItem) => void
}) {
  const [resultados, setResultados] = useState<InvItem[]>([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/compras/inventario/search?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(data)
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Descripción o código AL-I..."
        className="h-7 text-xs min-w-[180px]"
      />
      {cargando && <span className="absolute right-2 top-1.5 text-xs text-slate-400">...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-72 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
          )}
          {resultados.map(item => (
            <li
              key={item.id}
              onMouseDown={() => { onSelect(item); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="font-mono text-xs text-slate-400 mr-1">{item.codigo}</span>
                <span className="text-slate-800 text-xs">{item.descripcion}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="text-xs text-green-600">Stock: {Number(item.saldo_existencias ?? 0).toFixed(0)}</span>
                {item.costo_unitario > 0 && (
                  <span className="text-xs text-blue-600">${Number(item.costo_unitario).toFixed(2)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Tipos ítems OC ──────────────────────────────────────────────────────────

type ItemOC = {
  item_np_id: string | null
  seleccionado: boolean
  codigo: string
  descripcion: string
  unidad: string
  cantidad: string
  precio_unitario: string
  tipo: string
  informacion_adicional: string
  fecha_entrega: string
}

// ─── Formulario conversión a OC (parcial / multi-OC) ─────────────────────────

function FormularioOC({ np, itemsNP, onConvertida }: { np: NP; itemsNP: Item[]; onConvertida: (numeroOC: string) => void }) {
  const [enviando, setEnviando]     = useState(false)
  const [error, setError]           = useState('')
  const [proveedorId, setProveedorId] = useState<string | null>(null)
  const [proximaOC, setProximaOC]   = useState<string>('Cargando...')
  const [unidades, setUnidades]     = useState<string[]>(['EA'])
  const [form, setForm]             = useState({
    proveedor:         '',
    fecha_oc:          '',
    descripcion_oc:    np.descripcion_general,
    numero_factura:    '',
    fecha_factura:     '',
    valor_retenido:    '0',
    tipo_pago:         '',
    banco:             '',
    dias_credito:      '0',
    fecha_vencimiento: '',
    mes_pago:          '',
    numero_cotizacion: '',
  })

  useEffect(() => {
    const year = new Date().getFullYear()
    fetch('/api/compras/secuencia-oc')
      .then(r => r.json())
      .then((data: { año: number; ultimo_numero: number }[]) => {
        const row = Array.isArray(data) ? data.find(s => s.año === year) : null
        const siguiente = row ? row.ultimo_numero + 1 : 1
        setProximaOC(`OC-${year}-${String(siguiente).padStart(4, '0')}`)
      })
      .catch(() => setProximaOC('Error al cargar'))

    fetch('/api/compras/unidades')
      .then(r => r.json())
      .then(data => setUnidades(data))
      .catch(err => console.error('Error cargando unidades:', err))
  }, [])

  // Ítems pre-cargados desde la NP — todos seleccionados por defecto
  const [itemsOC, setItemsOC] = useState<ItemOC[]>(() =>
    itemsNP.map(i => ({
      item_np_id:           i.id,
      seleccionado:         true,
      codigo:               i.codigo || '',
      descripcion:          i.descripcion,
      unidad:               i.unidad,
      cantidad:             String(i.cantidad),
      precio_unitario:      String(i.precio_unitario),
      tipo:                 '',
      informacion_adicional: '',
      fecha_entrega:        '',
    }))
  )

  function setField(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setItem(index: number, key: keyof ItemOC, val: string) {
    setItemsOC(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item))
  }

  function toggleSeleccion(index: number) {
    setItemsOC(prev => prev.map((item, i) => i === index ? { ...item, seleccionado: !item.seleccionado } : item))
  }

  function agregarItem() {
    setItemsOC(prev => [...prev, {
      item_np_id: null, seleccionado: true, codigo: '', descripcion: '', unidad: 'EA',
      cantidad: '1', precio_unitario: '0', tipo: '', informacion_adicional: '', fecha_entrega: '',
    }])
  }

  function eliminarItem(index: number) {
    setItemsOC(prev => prev.filter((_, i) => i !== index))
  }

  const seleccionados = itemsOC.filter(i => i.seleccionado)
  const totalOC = seleccionados.reduce(
    (acc, item) => acc + (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0),
    0
  )
  const valorRetenido = Number(form.valor_retenido) || 0

  async function handleConvertir() {
    if (!form.proveedor.trim()) { setError('El proveedor es requerido'); return }
    if (seleccionados.length === 0) { setError('Selecciona al menos un ítem para incluir en la OC'); return }
    if (seleccionados.some(i => !i.descripcion.trim())) { setError('Todos los ítems seleccionados deben tener descripción'); return }
    setEnviando(true)
    setError('')
    try {
      const payload = {
        ...form,
        proveedor_id: proveedorId,
        valor_total:  totalOC,
        items: seleccionados.map(i => ({
          item_np_id:           i.item_np_id,
          codigo:               i.codigo || null,
          descripcion:          i.descripcion,
          unidad:               i.unidad,
          cantidad:             Number(i.cantidad) || 0,
          precio_unitario:      Number(i.precio_unitario) || 0,
          tipo:                 i.tipo || null,
          informacion_adicional: i.informacion_adicional || null,
          fecha_entrega:        i.fecha_entrega || null,
        })),
      }
      const res = await fetch(`/api/compras/convertir/${np.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) { onConvertida(data.numero_oc) }
      else { setError(data.error || 'Error al convertir') }
    } catch {
      setError('Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-blue-800">Convertir a Orden de Compra</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Ítems de la OC — selección parcial con checkbox */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-slate-700">Ítems a incluir en esta OC</p>
            <button type="button" onClick={agregarItem} className="text-xs text-blue-600 hover:underline font-medium">+ Ítem nuevo</button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Desmarca los ítems que irán a otra OC. Puedes ajustar la cantidad.</p>
          <div className="space-y-2">
            {itemsOC.map((item, i) => (
              <div key={i} className={`border rounded-lg p-3 space-y-2 transition-colors ${item.seleccionado ? 'bg-slate-50' : 'bg-white opacity-50'}`}>
                {/* Fila 1: checkbox + línea + descripción + eliminar */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.seleccionado}
                    onChange={() => toggleSeleccion(i)}
                    className="rounded shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-500">Descripción *</Label>
                      <a href="/compras/inventario/nuevo" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline">
                        ¿No existe? Crear ítem →
                      </a>
                    </div>
                    <InventarioSearch
                      value={item.descripcion}
                      onChange={val => setItem(i, 'descripcion', val)}
                      onSelect={inv => {
                        setItemsOC(prev => prev.map((it, idx) => idx === i ? {
                          ...it,
                          descripcion:     inv.descripcion,
                          codigo:          inv.codigo,
                          precio_unitario: inv.costo_unitario > 0 ? String(inv.costo_unitario) : it.precio_unitario,
                        } : it))
                      }}
                    />
                  </div>
                  {!item.item_np_id && (
                    <button type="button" onClick={() => eliminarItem(i)} className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
                  )}
                </div>
                {/* Fila 2: tipo + código + unidad + cantidad + precio + total */}
                {item.seleccionado && (
                  <div className="space-y-2 pl-6">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div>
                      <Label className="text-xs text-slate-500">Tipo</Label>
                      <select value={item.tipo} onChange={e => setItem(i, 'tipo', e.target.value)} className="mt-0.5 h-7 rounded-md border border-input bg-background px-1 text-xs w-24 block">
                        <option value="">—</option>
                        <option value="BIENES">BIENES</option>
                        <option value="SERVICIOS">SERVICIOS</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Código</Label>
                      <Input value={item.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} className="h-7 text-xs font-mono w-28 mt-0.5" placeholder="AL-I-0000" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Unidad</Label>
                      <select value={item.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} className="mt-0.5 h-7 rounded-md border border-input bg-background px-1 text-xs w-16 block">
                        {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Cantidad</Label>
                      <Input type="number" step="0.01" min="0" value={item.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} className="h-7 text-xs w-20 mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">P. Unit. USD</Label>
                      <Input type="number" step="0.01" min="0" value={item.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)} className="h-7 text-xs w-24 mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Fecha Entrega</Label>
                      <Input type="date" value={item.fecha_entrega} onChange={e => setItem(i, 'fecha_entrega', e.target.value)} className="h-7 text-xs w-32 mt-0.5" />
                    </div>
                    <div className="ml-auto text-right">
                      <Label className="text-xs text-slate-500">Total</Label>
                      <p className="text-sm font-bold text-blue-700 mt-0.5">
                        ${((parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Información Adicional</Label>
                    <Input value={item.informacion_adicional} onChange={e => setItem(i, 'informacion_adicional', e.target.value)} className="h-7 text-xs mt-0.5" placeholder="Especificaciones, notas..." />
                  </div>
                  </div>
                )}
              </div>
            ))}
            {/* Total general */}
            <div className="flex justify-end pt-1 border-t">
              <div className="text-right">
                <span className="text-sm text-slate-500">Total OC:</span>
                <span className="ml-2 text-lg font-bold text-blue-700">${totalOC.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Datos de la OC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label className="text-xs">Proveedor *</Label>
            <ProveedorSearch
              value={form.proveedor}
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
              {proximaOC}
            </div>
          </div>
          <div>
            <Label className="text-xs">Fecha OC</Label>
            <Input type="date" value={form.fecha_oc} onChange={e => setField('fecha_oc', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">N° Cotización</Label>
            <Input value={form.numero_cotizacion} onChange={e => setField('numero_cotizacion', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Número de Factura</Label>
            <Input value={form.numero_factura} onChange={e => setField('numero_factura', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Fecha Factura</Label>
            <Input type="date" value={form.fecha_factura} onChange={e => setField('fecha_factura', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Tipo de Pago</Label>
            <select value={form.tipo_pago} onChange={e => setField('tipo_pago', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Selecciona...</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
              <option value="anticipado">Anticipado</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Valor Retenido USD</Label>
            <Input type="number" step="0.01" value={form.valor_retenido} onChange={e => setField('valor_retenido', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Banco</Label>
            <Input value={form.banco} onChange={e => setField('banco', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Días Crédito</Label>
            <Input type="number" value={form.dias_credito} onChange={e => setField('dias_credito', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Fecha Vencimiento</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={e => setField('fecha_vencimiento', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Mes de Pago</Label>
            <Input value={form.mes_pago} onChange={e => setField('mes_pago', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Ej: Enero 2026" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Descripción OC</Label>
          <Textarea value={form.descripcion_oc} onChange={e => setField('descripcion_oc', e.target.value)} className="mt-1 text-sm min-h-[60px]" />
        </div>

        {/* Resumen valores */}
        <div className="bg-slate-50 rounded-md p-3 text-sm flex flex-col gap-1">
          <div className="flex justify-between"><span className="text-slate-500">Total OC</span><span className="font-medium">{usd(totalOC)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Retención</span><span className="font-medium text-red-600">- {usd(valorRetenido)}</span></div>
          <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Valor a Pagar</span><span className="font-bold text-blue-700">{usd(totalOC - valorRetenido)}</span></div>
        </div>

        {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <Button onClick={handleConvertir} disabled={enviando} className="w-full btn-primary">
          {enviando ? 'Procesando...' : '🛒 Registrar Orden de Compra'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DetalleNPPage() {
  const params = useParams()
  const id = params.id as string

  const [np, setNp]               = useState<NP | null>(null)
  const [items, setItems]         = useState<Item[]>([])
  const [historial, setHistorial] = useState<Historial[]>([])
  const [ocs, setOcs]             = useState<OCVinculada[]>([])
  const [cargando, setCargando]   = useState(true)
  const [error, setError]         = useState('')
  const [ultimaOC, setUltimaOC]  = useState('')
  const [rol, setRol]             = useState('')
  const [userId, setUserId]       = useState('')
  const [puedeAprobar, setPuedeAprobar] = useState(false)

  // Completar NP
  const [completando, setCompletando] = useState(false)
  const [errorCompletar, setErrorCompletar] = useState('')

  // Reabrir NP
  const [modalReabrir, setModalReabrir] = useState(false)
  const [reabriendo, setReabriendo]     = useState(false)
  const [errorReabrir, setErrorReabrir] = useState('')

  // Edición inline de NP rechazada
  const [modoEdicion, setModoEdicion]     = useState(false)
  const [editEnc, setEditEnc]             = useState<{
    solicitante_nombre: string; solicitante_email: string; area: string
    prioridad: string; tipo_compra: string; centro_costo: string; descripcion_general: string
  } | null>(null)
  const [editItems, setEditItems]         = useState<{
    codigo: string; descripcion: string; unidad: string
    cantidad: string; precio_unitario: string; proveedor_sugerido: string
  }[]>([])
  const [editAreas, setEditAreas]         = useState<string[]>([])
  const [editUnidades, setEditUnidades]   = useState<string[]>(['EA'])
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardar, setErrorGuardar]   = useState('')

  // Asignación (compras/admin)
  const [asistentes, setAsistentes]     = useState<Asistente[]>([])
  const [asistenteSelec, setAsistenteSelec] = useState('')
  const [asignando, setAsignando]       = useState(false)
  const [errorAsignar, setErrorAsignar] = useState('')

  // Acciones de aprobación
  const [accionando, setAccionando]   = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [motivoDevolucion, setMotivoDevolucion] = useState('')
  const [msgAccion, setMsgAccion]     = useState('')
  const [errAccion, setErrAccion]     = useState('')

  useEffect(() => {
    fetch('/api/auth/perfil').then(r => r.json()).then(p => {
      if (p.rol) setRol(p.rol)
      if (p.id)  setUserId(p.id)
      if (['compras', 'admin'].includes(p.rol))
        fetch('/api/compras/asistentes').then(r => r.json()).then(setAsistentes).catch(console.error)
    })
  }, [])

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/nps/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setNp(data.np)
        setItems(data.items)
        setHistorial(data.historial)
        setOcs(data.ocs ?? [])
        setPuedeAprobar(data.puedeAprobar ?? false)
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })
  }

  useEffect(() => { cargar() }, [id])

  async function ejecutarAccion(accion: 'aprobar' | 'rechazar' | 'devolver') {
    if (accion === 'rechazar' && !motivoRechazo.trim()) { setErrAccion('El motivo de rechazo es requerido'); return }
    if (accion === 'devolver' && !motivoDevolucion.trim()) { setErrAccion('El motivo de devolución es requerido'); return }
    setAccionando(true); setErrAccion(''); setMsgAccion('')
    try {
      const res = await fetch(`/api/compras/nps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion,
          motivo: accion === 'rechazar' ? motivoRechazo : accion === 'devolver' ? motivoDevolucion : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) { setMsgAccion('Acción ejecutada correctamente'); cargar() }
      else setErrAccion(data.error || 'Error al ejecutar la acción')
    } catch { setErrAccion('Error de conexión') }
    finally { setAccionando(false) }
  }

  async function handleAsignar(accion: 'asignar' | 'reasignar' | 'tomar_control') {
    if (accion !== 'tomar_control' && !asistenteSelec) return
    setAsignando(true)
    setErrorAsignar('')
    const body: Record<string, string> = { accion }
    if (accion !== 'tomar_control') body.asistente_id = asistenteSelec
    const res = await fetch(`/api/compras/nps/${id}/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setAsignando(false)
    if (!res.ok) { setErrorAsignar(data.error ?? 'Error'); return }
    setAsistenteSelec('')
    cargar()
  }

  async function activarEdicion() {
    if (!np) return
    setEditEnc({
      solicitante_nombre:  np.solicitante_nombre,
      solicitante_email:   np.solicitante_email,
      area:                np.area,
      prioridad:           np.prioridad,
      tipo_compra:         np.tipo_compra,
      centro_costo:        np.centro_costo,
      descripcion_general: np.descripcion_general,
    })
    setEditItems(items.map(i => ({
      codigo:             i.codigo || '',
      descripcion:        i.descripcion,
      unidad:             i.unidad,
      cantidad:           String(i.cantidad),
      precio_unitario:    String(i.precio_unitario ?? 0),
      proveedor_sugerido: i.proveedor_sugerido || '',
    })))
    if (editAreas.length === 0) {
      const [resA, resU] = await Promise.all([
        fetch('/api/compras/areas').then(r => r.json()).catch(() => []),
        fetch('/api/compras/unidades').then(r => r.json()).catch(() => ['EA']),
      ])
      setEditAreas(resA)
      setEditUnidades(resU)
    }
    setErrorGuardar('')
    setModoEdicion(true)
  }

  async function handleReenviar() {
    if (!editEnc) return
    if (editItems.length === 0) { setErrorGuardar('Agrega al menos un ítem'); return }
    if (editItems.some(i => !i.descripcion.trim())) { setErrorGuardar('Todos los ítems deben tener descripción'); return }
    setGuardando(true)
    setErrorGuardar('')
    const res = await fetch(`/api/compras/nps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encabezado: editEnc,
        items: editItems.map(i => ({
          codigo:             i.codigo || null,
          descripcion:        i.descripcion,
          unidad:             i.unidad,
          cantidad:           Number(i.cantidad) || 0,
          precio_unitario:    Number(i.precio_unitario) || 0,
          proveedor_sugerido: i.proveedor_sugerido || null,
        })),
      }),
    })
    const data = await res.json()
    setGuardando(false)
    if (!res.ok) { setErrorGuardar(data.error ?? 'Error al reenviar'); return }
    setModoEdicion(false)
    cargar()
  }

  async function handleReabrir() {
    setReabriendo(true)
    setErrorReabrir('')
    const res = await fetch(`/api/compras/nps/${id}/reabrir`, { method: 'POST' })
    const data = await res.json()
    setReabriendo(false)
    if (!res.ok) { setErrorReabrir(data.error ?? 'Error'); return }
    setModalReabrir(false)
    cargar()
  }

  async function handleCompletar() {
    setCompletando(true)
    setErrorCompletar('')
    const res = await fetch(`/api/compras/nps/${id}/completar`, { method: 'POST' })
    const data = await res.json()
    setCompletando(false)
    if (!res.ok) { setErrorCompletar(data.error ?? 'Error'); return }
    cargar()
  }

  const mostrarAprobacion    = np?.estado === 'pendiente' && puedeAprobar
  const mostrarDevolucion    = np?.estado === 'aprobada' && ['compras', 'admin'].includes(rol)
  const puedeVerPrecio       = ['compras', 'admin', 'asistente_compras'].includes(rol)
  // Spec: puede editar el creador (creado_por_id) o compras/admin; NP debe estar rechazada
  const puedeEditarRechazada = np?.estado === 'rechazada' &&
    (np.creado_por_id === userId || ['compras', 'admin'].includes(rol))

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>
  if (error || !np) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="text-center space-y-3">
        <p>{error || 'NP no encontrada'}</p>
        <Link href="/compras" className="text-blue-600 text-sm hover:underline">← Volver</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/compras" className="text-blue-300 text-xs hover:text-white">← NPs</Link>
            <h1 className="text-xl font-bold mt-1">{np.numero}</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Spec: botón Editar solo para el creador o compras/admin en NPs rechazadas */}
            {puedeEditarRechazada && !modoEdicion && (
              <button
                onClick={activarEdicion}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/40 text-white hover:bg-white/10 transition-colors font-medium"
              >
                ✏️ Editar NP
              </button>
            )}
            {/* Spec: botón Reabrir solo para compras/admin en NPs completadas */}
            {np.estado === 'completada' && ['compras', 'admin'].includes(rol) && (
              <button
                onClick={() => { setErrorReabrir(''); setModalReabrir(true) }}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/40 text-white hover:bg-white/10 transition-colors font-medium"
              >
                🔓 Reabrir NP
              </button>
            )}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${ESTADO_COLOR[np.estado] ?? ''}`}>
              {np.estado}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Encabezado NP */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Datos del Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-slate-500">Solicitante</p><p className="font-medium">{np.solicitante_nombre}</p><p className="text-xs text-slate-400">{np.solicitante_email}</p></div>
              <div><p className="text-xs text-slate-500">Área</p><p className="font-medium">{np.area}</p></div>
              <div><p className="text-xs text-slate-500">Prioridad</p><p className="font-medium capitalize">{np.prioridad}</p></div>
              <div><p className="text-xs text-slate-500">Tipo de Compra</p><p className="font-medium capitalize">{np.tipo_compra}</p></div>
              <div><p className="text-xs text-slate-500">Centro de Costo</p><p className="font-medium capitalize">{np.centro_costo}</p></div>
              {puedeVerPrecio && <div><p className="text-xs text-slate-500">Total Estimado</p><p className="font-bold text-blue-700">{np.total_estimado != null ? usd(Number(np.total_estimado)) : '—'}</p></div>}
              <div><p className="text-xs text-slate-500">Fecha Solicitud</p><p className="font-medium">{new Date(np.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
              <div><p className="text-xs text-slate-500">OC Generada</p><p className={`font-medium ${np.convertida ? 'text-blue-600' : 'text-slate-400'}`}>{np.convertida ? '✓ Sí' : 'No'}</p></div>
              {['compras', 'admin'].includes(rol) && (
                <div>
                  <p className="text-xs text-slate-500">Asignada a</p>
                  {np.asignado_nombre
                    ? <p className="font-medium text-cyan-700">👤 {np.asignado_nombre}</p>
                    : <p className="text-slate-400 text-sm">Sin asignar</p>}
                </div>
              )}
            </div>
            {np.descripcion_general && (
              <div className="mt-4 bg-slate-50 rounded-md p-3 text-sm">
                <p className="text-xs text-slate-500 mb-1">DESCRIPCIÓN GENERAL</p>
                <p>{np.descripcion_general}</p>
              </div>
            )}
            {np.motivo_rechazo && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm">
                <p className="text-xs font-semibold text-red-700 mb-1">MOTIVO DE RECHAZO</p>
                <p className="text-red-800">{np.motivo_rechazo}</p>
              </div>
            )}
            {np.motivo_devolucion && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                <p className="text-xs font-semibold text-amber-700 mb-1">MOTIVO DE DEVOLUCIÓN</p>
                <p className="text-amber-800">{np.motivo_devolucion}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ítems */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Ítems del Requerimiento</CardTitle>
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
                    <th className="text-left py-2 pr-3">Proveedor Sugerido</th>
                    {puedeVerPrecio && <th className="text-right py-2 pr-3">P. Unit.</th>}
                    {puedeVerPrecio && <th className="text-right py-2">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-slate-500">{item.linea}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-400">{item.codigo || '—'}</td>
                      <td className="py-2 pr-3">{item.descripcion}</td>
                      <td className="py-2 pr-3 text-center">{item.cantidad} {item.unidad}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{item.proveedor_sugerido || '—'}</td>
                      {puedeVerPrecio && <td className="py-2 pr-3 text-right">{item.precio_unitario != null ? usd(Number(item.precio_unitario)) : '—'}</td>}
                      {puedeVerPrecio && <td className="py-2 text-right font-medium">{usd(item.total)}</td>}
                    </tr>
                  ))}
                </tbody>
                {puedeVerPrecio && (
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="py-2 pr-3 text-right font-semibold text-sm">Total Estimado</td>
                      <td className="py-2 text-right font-bold text-blue-700">{np.total_estimado != null ? usd(Number(np.total_estimado)) : '—'}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* OCs vinculadas + acciones de gestión */}
        {(ocs.length > 0 || np.estado === 'aprobada') && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-slate-700">Órdenes de Compra Generadas</CardTitle>
                <div className="flex gap-2">
                  <a href={`/api/compras/nps/${id}/exportar`} download>
                    <Button variant="outline" className="h-8 text-xs border-slate-300 text-slate-600 hover:bg-slate-50">
                      ⬇ Exportar ítems NP
                    </Button>
                  </a>
                  {np.estado === 'aprobada' && np.convertida && ['compras', 'admin', 'asistente_compras'].includes(rol) && (
                    <Button
                      onClick={handleCompletar}
                      disabled={completando}
                      className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {completando ? 'Procesando...' : '🏁 Marcar como Completada'}
                    </Button>
                  )}
                </div>
              </div>
              {errorCompletar && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-2">{errorCompletar}</p>
              )}
            </CardHeader>
            <CardContent>
              {ocs.length === 0 ? (
                <p className="text-slate-400 text-sm">Aún no se han generado órdenes de compra desde esta NP.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-slate-500 uppercase">
                        <th className="text-left py-2 pr-4">Número OC</th>
                        <th className="text-left py-2 pr-4">Proveedor</th>
                        <th className="text-right py-2 pr-4">Total</th>
                        <th className="text-left py-2 pr-4">Estado</th>
                        <th className="text-left py-2 pr-4">Fecha OC</th>
                        <th className="text-left py-2">Generada por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocs.map(oc => (
                        <tr key={oc.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 pr-4">
                            <Link href={`/compras/ordenes/${oc.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                              {oc.numero_oc}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-slate-700">{oc.proveedor}</td>
                          <td className="py-2 pr-4 text-right font-medium">${Number(oc.valor_total).toFixed(2)}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_OC_BADGE[oc.estado_oc] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ESTADO_OC_LABEL[oc.estado_oc] ?? oc.estado_oc}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-500 text-xs">
                            {oc.fecha_oc ? new Date(oc.fecha_oc).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="py-2 text-slate-500 text-xs">{oc.creado_por_nombre ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Formulario edición inline — NP rechazada */}
        {modoEdicion && editEnc && (
          <Card className="border-amber-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-amber-800">Editar y Reenviar NP</CardTitle>
                <button onClick={() => setModoEdicion(false)} className="text-xs text-slate-500 hover:text-slate-700">✕ Cancelar</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Encabezado editable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre Solicitante *</Label>
                  <Input value={editEnc.solicitante_nombre} onChange={e => setEditEnc(f => f && ({ ...f, solicitante_nombre: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Email Solicitante *</Label>
                  <Input type="email" value={editEnc.solicitante_email} onChange={e => setEditEnc(f => f && ({ ...f, solicitante_email: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Área *</Label>
                  <select value={editEnc.area} onChange={e => setEditEnc(f => f && ({ ...f, area: e.target.value }))} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    {editAreas.length === 0 && <option value={editEnc.area}>{editEnc.area}</option>}
                    {editAreas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Prioridad *</Label>
                  <select value={editEnc.prioridad} onChange={e => setEditEnc(f => f && ({ ...f, prioridad: e.target.value }))} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="excepcional">Excepcional</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo de Compra *</Label>
                  <select value={editEnc.tipo_compra} onChange={e => setEditEnc(f => f && ({ ...f, tipo_compra: e.target.value }))} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                    <option value="alquiler">Alquiler</option>
                    <option value="importacion">Importación</option>
                    <option value="consumible">Consumible</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Centro de Costo *</Label>
                  <select value={editEnc.centro_costo} onChange={e => setEditEnc(f => f && ({ ...f, centro_costo: e.target.value }))} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="costo">Costo</option>
                    <option value="gasto">Gasto</option>
                    <option value="activo">Activo</option>
                    <option value="inventario">Inventario</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Descripción General *</Label>
                  <Textarea value={editEnc.descripcion_general} onChange={e => setEditEnc(f => f && ({ ...f, descripcion_general: e.target.value }))} className="mt-1 text-sm min-h-[60px]" />
                </div>
              </div>

              {/* Ítems editables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium text-slate-700">Ítems del Requerimiento</Label>
                  <button type="button" onClick={() => setEditItems(prev => [...prev, { codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0', proveedor_sugerido: '' }])}
                    className="text-xs text-blue-600 hover:underline font-medium">+ Agregar ítem</button>
                </div>
                <div className="space-y-2">
                  {editItems.map((item, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Descripción *</Label>
                          <InventarioSearch
                            value={item.descripcion}
                            onChange={val => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, descripcion: val } : it))}
                            onSelect={inv => setEditItems(prev => prev.map((it, idx) => idx === i ? {
                              ...it, descripcion: inv.descripcion, codigo: inv.codigo,
                              precio_unitario: inv.costo_unitario > 0 ? String(inv.costo_unitario) : it.precio_unitario,
                            } : it))}
                          />
                        </div>
                        {editItems.length > 1 && (
                          <button type="button" onClick={() => setEditItems(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
                        )}
                      </div>
                      <div className="flex items-end gap-2 flex-wrap pl-0">
                        <div>
                          <Label className="text-xs text-slate-500">Código</Label>
                          <Input value={item.codigo} onChange={e => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, codigo: e.target.value } : it))} className="h-7 text-xs font-mono w-28 mt-0.5" placeholder="AL-I-0000" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Unidad</Label>
                          <select value={item.unidad} onChange={e => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, unidad: e.target.value } : it))} className="mt-0.5 h-7 rounded-md border border-input bg-background px-1 text-xs w-16 block">
                            {(editUnidades.length > 0 ? editUnidades : ['EA', 'UN', 'M', 'KG', 'L']).map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Cantidad</Label>
                          <Input type="number" step="0.01" min="0" value={item.cantidad} onChange={e => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, cantidad: e.target.value } : it))} className="h-7 text-xs w-20 mt-0.5" />
                        </div>
                        {/* Spec: precio solo visible para compras, admin y asistente_compras */}
                        {puedeVerPrecio && (
                          <div>
                            <Label className="text-xs text-slate-500">P. Unit. USD</Label>
                            <Input type="number" step="0.01" min="0" value={item.precio_unitario} onChange={e => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, precio_unitario: e.target.value } : it))} className="h-7 text-xs w-24 mt-0.5" />
                          </div>
                        )}
                        {puedeVerPrecio && (
                          <div className="ml-auto text-right">
                            <Label className="text-xs text-slate-500">Total</Label>
                            <p className="text-sm font-bold text-blue-700 mt-0.5">
                              ${((parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0)).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                      {/* Proveedor sugerido — campo opcional, visible para todos */}
                      <div>
                        <Label className="text-xs text-slate-500">Proveedor Sugerido (opcional)</Label>
                        <Input value={item.proveedor_sugerido} onChange={e => setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, proveedor_sugerido: e.target.value } : it))} className="h-7 text-xs mt-0.5" placeholder="Nombre del proveedor recomendado para este ítem" />
                      </div>
                    </div>
                  ))}
                  {puedeVerPrecio && (
                    <div className="flex justify-end pt-1 border-t">
                      <span className="text-sm text-slate-500 mr-2">Total Estimado:</span>
                      <span className="text-lg font-bold text-blue-700">
                        ${editItems.reduce((acc, i) => acc + (parseFloat(i.cantidad) || 0) * (parseFloat(i.precio_unitario) || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {errorGuardar && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorGuardar}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModoEdicion(false)} className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handleReenviar} disabled={guardando}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: '#1a5252' }}>
                  {guardando ? 'Reenviando...' : '↗ Reenviar a Aprobación'}
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historial */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Historial de Estados</CardTitle>
          </CardHeader>
          <CardContent>
            {historial.length === 0 ? (
              <p className="text-slate-400 text-sm">Sin historial registrado.</p>
            ) : (
              <div className="space-y-0">
                {historial.map((h, i) => (
                  <div key={h.id} className="flex gap-4">
                    {/* Línea de tiempo */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-sm shrink-0">
                        {HISTORIAL_ICON[h.estado] ?? '•'}
                      </div>
                      {i < historial.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                    </div>
                    {/* Contenido */}
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_COLOR[h.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                          {HISTORIAL_LABEL[h.estado] ?? h.estado}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(h.fecha).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {(h.actor_nombre || h.actor_email) && (
                        <p className="text-xs text-slate-500 mt-0.5">{h.actor_nombre}{h.actor_email ? ` · ${h.actor_email}` : ''}</p>
                      )}
                      {h.notas && <p className="text-sm text-slate-700 mt-1">{h.notas}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sección aprobación/rechazo — para coordinadores y roles con acceso */}
        {mostrarAprobacion && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-800">Gestionar Nota de Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Motivo de rechazo (requerido si rechaza)</Label>
                <Textarea
                  value={motivoRechazo}
                  onChange={e => setMotivoRechazo(e.target.value)}
                  placeholder="Indique el motivo de rechazo..."
                  className="mt-1 text-sm min-h-[70px]"
                />
              </div>
              {errAccion && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errAccion}</p>}
              {msgAccion && <p className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">{msgAccion}</p>}
              <div className="flex gap-3">
                <Button onClick={() => ejecutarAccion('aprobar')} disabled={accionando} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {accionando ? 'Procesando...' : '✓ Aprobar NP'}
                </Button>
                <Button onClick={() => ejecutarAccion('rechazar')} disabled={accionando} variant="destructive" className="flex-1">
                  {accionando ? 'Procesando...' : '✗ Rechazar NP'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sección devolución — solo Compras/Admin sobre NPs aprobadas */}
        {mostrarDevolucion && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-800">Devolver al Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Motivo de devolución *</Label>
                <Textarea
                  value={motivoDevolucion}
                  onChange={e => setMotivoDevolucion(e.target.value)}
                  placeholder="Indique qué debe corregir el solicitante..."
                  className="mt-1 text-sm min-h-[70px]"
                />
              </div>
              {errAccion && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errAccion}</p>}
              {msgAccion && <p className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">{msgAccion}</p>}
              <Button onClick={() => ejecutarAccion('devolver')} disabled={accionando} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                {accionando ? 'Procesando...' : '↩ Devolver para corrección'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Panel asignación — solo compras/admin, NP aprobada no convertida */}
        {np.estado === 'aprobada' && !np.convertida && ['compras', 'admin'].includes(rol) && (
          <Card className="border-cyan-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-cyan-800">Asignación a Asistente</CardTitle>
                {np.asignado_nombre && (
                  <span className="text-xs bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full font-medium">
                    👤 {np.asignado_nombre}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Asistente de Compras</Label>
                <select
                  value={asistenteSelec}
                  onChange={e => setAsistenteSelec(e.target.value)}
                  className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Seleccionar asistente —</option>
                  {asistentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
                  ))}
                </select>
              </div>
              {errorAsignar && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorAsignar}</p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleAsignar(np.asignado_a ? 'reasignar' : 'asignar')}
                  disabled={asignando || !asistenteSelec}
                  className="btn-primary h-8 text-xs px-4"
                >
                  {asignando ? 'Procesando...' : np.asignado_a ? 'Reasignar' : 'Asignar'}
                </Button>
                {np.asignado_a && (
                  <Button
                    onClick={() => handleAsignar('tomar_control')}
                    disabled={asignando}
                    variant="outline"
                    className="h-8 text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
                  >
                    {asignando ? '...' : '🎯 Tomar control'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Formulario conversión — múltiples OCs desde la misma NP */}
        {np.estado === 'aprobada' &&
          (['compras', 'admin'].includes(rol) || (rol === 'asistente_compras' && np.asignado_a === userId)) && (
          <FormularioOC np={np} itemsNP={items} onConvertida={(numeroOC) => { setUltimaOC(numeroOC); cargar() }} />
        )}

        {np.convertida && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center text-sm text-blue-800 font-medium space-y-1">
            <p>✓ Esta NP fue convertida a Orden de Compra y registrada en el sistema.</p>
            {ultimaOC && <p className="font-mono text-blue-700">{ultimaOC}</p>}
          </div>
        )}
      </div>

      {/* Modal confirmación reabrir NP */}
      {modalReabrir && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalReabrir(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
              <h2 className="text-white font-semibold text-base">Reabrir Nota de Pedido</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(201,168,64,0.9)' }}>{np.numero}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-700">
                ¿Estás seguro de que deseas reabrir esta NP? Volverá al estado <span className="font-semibold">Aprobada</span> y podrán generarse nuevas Órdenes de Compra desde ella.
              </p>
              {errorReabrir && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{errorReabrir}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setModalReabrir(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReabrir}
                  disabled={reabriendo}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: '#1a5252' }}
                >
                  {reabriendo ? 'Procesando...' : '🔓 Confirmar reapertura'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
