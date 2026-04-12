'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string; nombre: string; clasificacion: string | null
  categoria: string | null; ciudad: string | null
  telefono: string | null; email: string | null; contacto: string | null
}

type InvItem = {
  id: string; codigo: string; descripcion: string
  costo_unitario: number; saldo_existencias: number
}

type ItemOC = {
  codigo: string; descripcion: string; unidad: string
  cantidad: string; precio_unitario: string
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
        const res = await fetch(`/api/compras/proveedores?q=${encodeURIComponent(val)}`)
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
        const res = await fetch(`/api/compras/inventario/search?q=${encodeURIComponent(val)}`)
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

export default function NuevaOCPage() {
  const router = useRouter()

  const [enviando, setEnviando]       = useState(false)
  const [error, setError]             = useState('')
  const [proveedorId, setProveedorId] = useState<string | null>(null)
  const [proximaOC, setProximaOC]     = useState('Cargando...')

  const [form, setForm] = useState({
    proveedor:         '',
    fecha_oc:          '',
    descripcion_oc:    '',
    area:              '',
    tipo_compra:       '',
    centro_costo:      '',
    numero_factura:    '',
    fecha_factura:     '',
    valor_retenido:    '0',
    tipo_pago:         '',
    banco:             '',
    dias_credito:      '0',
    fecha_vencimiento: '',
    mes_pago:          '',
  })

  const [items, setItems] = useState<ItemOC[]>([
    { codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0' },
  ])

  useEffect(() => {
    const year = new Date().getFullYear()
    fetch('/api/compras/secuencia-oc')
      .then(r => r.json())
      .then((data: { año: number; ultimo_numero: number }[]) => {
        const row = Array.isArray(data) ? data.find(s => s.año === year) : null
        const sig = row ? row.ultimo_numero + 1 : 1
        setProximaOC(`OC-${year}-${String(sig).padStart(4, '0')}`)
      })
      .catch(() => setProximaOC('—'))
  }, [])

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  function setItem(i: number, key: keyof ItemOC, val: string) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  }

  function agregarItem() {
    setItems(prev => [...prev, { codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0' }])
  }

  function eliminarItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  const totalOC       = items.reduce((acc, it) => acc + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_unitario) || 0), 0)
  const valorRetenido = Number(form.valor_retenido) || 0

  async function handleGuardar() {
    if (!form.proveedor.trim()) { setError('El proveedor es requerido'); return }
    if (items.length === 0)     { setError('La OC debe tener al menos un ítem'); return }
    if (items.some(i => !i.descripcion.trim())) { setError('Todos los ítems deben tener descripción'); return }

    setEnviando(true); setError('')
    try {
      const res = await fetch('/api/compras/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          proveedor_id: proveedorId,
          valor_total:  totalOC,
          items: items.map(i => ({
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
        router.push(`/compras/ordenes/${data.oc_id}`)
      } else {
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexión') }
    finally  { setEnviando(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <Link href="/compras/ordenes" className="text-blue-300 text-xs hover:text-white">← Órdenes de Compra</Link>
          <h1 className="text-xl font-bold mt-1">Nueva Orden de Compra</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-blue-800">Datos de la OC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Ítems */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-700">Ítems</p>
                <button type="button" onClick={agregarItem} className="text-xs text-blue-600 hover:underline font-medium">+ Agregar ítem</button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
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
                          value={item.descripcion}
                          onChange={val => setItem(i, 'descripcion', val)}
                          onSelect={inv => setItems(prev => prev.map((it, idx) => idx === i ? {
                            ...it,
                            descripcion:     inv.descripcion,
                            codigo:          inv.codigo,
                            precio_unitario: inv.costo_unitario > 0 ? String(inv.costo_unitario) : it.precio_unitario,
                          } : it))}
                        />
                      </div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => eliminarItem(i)} className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
                      )}
                    </div>
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
                <div className="flex justify-end pt-1 border-t">
                  <div className="text-right">
                    <span className="text-sm text-slate-500">Total OC:</span>
                    <span className="ml-2 text-lg font-bold text-blue-700">${totalOC.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Datos generales */}
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
                <Label className="text-xs">Área</Label>
                <select value={form.area} onChange={e => setField('area', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Selecciona...</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Tipo de Compra</Label>
                <select value={form.tipo_compra} onChange={e => setField('tipo_compra', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Selecciona...</option>
                  <option value="bienes">Bienes</option>
                  <option value="servicios">Servicios</option>
                  <option value="obra">Obra</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Centro de Costo</Label>
                <Input value={form.centro_costo} onChange={e => setField('centro_costo', e.target.value)} className="mt-1 h-8 text-sm" />
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
                <Label className="text-xs">Número de Factura</Label>
                <Input value={form.numero_factura} onChange={e => setField('numero_factura', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Fecha Factura</Label>
                <Input type="date" value={form.fecha_factura} onChange={e => setField('fecha_factura', e.target.value)} className="mt-1 h-8 text-sm" />
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

            {/* Resumen */}
            <div className="bg-slate-50 rounded-md p-3 text-sm flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-slate-500">Total OC</span><span className="font-medium">${totalOC.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Retención</span><span className="font-medium text-red-600">- ${valorRetenido.toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Valor a Pagar</span><span className="font-bold text-blue-700">${(totalOC - valorRetenido).toFixed(2)}</span></div>
            </div>

            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            <div className="flex gap-3">
              <Button onClick={handleGuardar} disabled={enviando} className="flex-1 btn-primary">
                {enviando ? 'Guardando...' : 'Registrar Orden de Compra'}
              </Button>
              <Link href="/compras/ordenes">
                <Button variant="outline">Cancelar</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
