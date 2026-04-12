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
}

type Item = {
  id: string
  linea: number
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  total: number
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
  pendiente:  'bg-yellow-100 text-yellow-800',
  aprobada:   'bg-green-100 text-green-800',
  rechazada:  'bg-red-100 text-red-800',
  devuelta:   'bg-amber-100 text-amber-800',
  convertida: 'bg-blue-100 text-blue-800',
}

const HISTORIAL_ICON: Record<string, string> = {
  pendiente:  '📋',
  aprobada:   '✅',
  rechazada:  '❌',
  devuelta:   '↩',
  convertida: '🛒',
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
  codigo: string
  descripcion: string
  unidad: string
  cantidad: string
  precio_unitario: string
}

const UNIDADES = ['EA', 'UN', 'M', 'ML', 'KG', 'LT', 'GL', 'M2', 'M3', 'JGO', 'RLL', 'CJA', 'PAR', 'HRS']

// ─── Formulario conversión a OC ──────────────────────────────────────────────

function FormularioOC({ np, itemsNP, onConvertida }: { np: NP; itemsNP: Item[]; onConvertida: (numeroOC: string) => void }) {
  const [enviando, setEnviando]     = useState(false)
  const [error, setError]           = useState('')
  const [proveedorId, setProveedorId] = useState<string | null>(null)
  const [proximaOC, setProximaOC]   = useState<string>('Cargando...')
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
  }, [])

  // Ítems de la OC pre-cargados desde la NP
  const [itemsOC, setItemsOC] = useState<ItemOC[]>(() =>
    itemsNP.map(i => ({
      codigo:          i.codigo || '',
      descripcion:     i.descripcion,
      unidad:          i.unidad,
      cantidad:        String(i.cantidad),
      precio_unitario: String(i.precio_unitario),
    }))
  )

  function setField(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setItem(index: number, key: keyof ItemOC, val: string) {
    setItemsOC(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item))
  }

  function agregarItem() {
    setItemsOC(prev => [...prev, { codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0' }])
  }

  function eliminarItem(index: number) {
    setItemsOC(prev => prev.filter((_, i) => i !== index))
  }

  const totalOC = itemsOC.reduce(
    (acc, item) => acc + (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0),
    0
  )
  const valorRetenido = Number(form.valor_retenido) || 0

  async function handleConvertir() {
    if (!form.proveedor.trim()) {
      setError('El proveedor es requerido')
      return
    }
    if (itemsOC.length === 0) {
      setError('La OC debe tener al menos un ítem')
      return
    }
    if (itemsOC.some(i => !i.descripcion.trim())) {
      setError('Todos los ítems deben tener descripción')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const payload = {
        ...form,
        proveedor_id: proveedorId,
        valor_total: totalOC,
        items: itemsOC.map(i => ({
          codigo:          i.codigo || null,
          descripcion:     i.descripcion,
          unidad:          i.unidad,
          cantidad:        Number(i.cantidad) || 0,
          precio_unitario: Number(i.precio_unitario) || 0,
        })),
      }
      const res = await fetch(`/api/compras/convertir/${np.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        onConvertida(data.numero_oc)
      } else {
        setError(data.error || 'Error al convertir')
      }
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

        {/* Ítems de la OC */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-700">Ítems de la OC</p>
            <button type="button" onClick={agregarItem} className="text-xs text-blue-600 hover:underline font-medium">+ Agregar ítem</button>
          </div>
          <div className="space-y-2">
            {itemsOC.map((item, i) => (
              <div key={i} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                {/* Fila 1: línea + descripción (ancha) + eliminar */}
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
                  {itemsOC.length > 1 && (
                    <button type="button" onClick={() => eliminarItem(i)} className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
                  )}
                </div>
                {/* Fila 2: código + unidad + cantidad + precio + total */}
                <div className="flex items-end gap-2 flex-wrap pl-7">
                  <div>
                    <Label className="text-xs text-slate-500">Código</Label>
                    <Input value={item.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} className="h-7 text-xs font-mono w-28 mt-0.5" placeholder="AL-I-0000" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Unidad</Label>
                    <select value={item.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} className="mt-0.5 h-7 rounded-md border border-input bg-background px-1 text-xs w-16 block">
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
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
                  <div className="ml-auto text-right">
                    <Label className="text-xs text-slate-500">Total</Label>
                    <p className="text-sm font-bold text-blue-700 mt-0.5">
                      ${((parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0)).toFixed(2)}
                    </p>
                  </div>
                </div>
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
  const [cargando, setCargando]   = useState(true)
  const [error, setError]         = useState('')
  const [ultimaOC, setUltimaOC]  = useState('')
  const [rol, setRol]             = useState('')

  useEffect(() => {
    fetch('/api/auth/perfil').then(r => r.json()).then(p => { if (p.rol) setRol(p.rol) })
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
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })
  }

  useEffect(() => { cargar() }, [id])

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
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${ESTADO_COLOR[np.estado] ?? ''}`}>
            {np.estado}
          </span>
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
              <div><p className="text-xs text-slate-500">Total Estimado</p><p className="font-bold text-blue-700">{usd(np.total_estimado)}</p></div>
              <div><p className="text-xs text-slate-500">Fecha Solicitud</p><p className="font-medium">{new Date(np.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
              <div><p className="text-xs text-slate-500">OC Generada</p><p className={`font-medium ${np.convertida ? 'text-blue-600' : 'text-slate-400'}`}>{np.convertida ? '✓ Sí' : 'No'}</p></div>
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
                      <td className="py-2 pr-3 text-right">{usd(item.precio_unitario)}</td>
                      <td className="py-2 text-right font-medium">{usd(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="py-2 pr-3 text-right font-semibold text-sm">Total Estimado</td>
                    <td className="py-2 text-right font-bold text-blue-700">{usd(np.total_estimado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

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
                          {h.estado}
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

        {/* Formulario conversión — solo compras y admin */}
        {np.estado === 'aprobada' && !np.convertida && ['compras', 'admin'].includes(rol) && (
          <FormularioOC np={np} itemsNP={items} onConvertida={(numeroOC) => { setUltimaOC(numeroOC); cargar() }} />
        )}

        {np.convertida && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center text-sm text-blue-800 font-medium space-y-1">
            <p>✓ Esta NP fue convertida a Orden de Compra y registrada en el sistema.</p>
            {ultimaOC && <p className="font-mono text-blue-700">{ultimaOC}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
