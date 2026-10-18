'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Area = { id: string; nombre: string }
type Proveedor = { id: string; nombre: string }
type ItemForm = {
  codigo: string; descripcion: string; unidad: string; categoria: string
  precio_unitario: string; precio_maximo: string
  // Spec: HU-019 CA-04 — vínculo a la línea de NP de origen, preservado hasta el POST
  item_np_id?: string | null
}

const ITEM_VACIO: ItemForm = { codigo: '', descripcion: '', unidad: '', categoria: '', precio_unitario: '', precio_maximo: '' }

export default function NuevaOcaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [areas, setAreas]           = useState<Area[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])

  const [proveedorId, setProveedorId]     = useState('')
  const [tipo, setTipo]                   = useState<'precio_fijo' | 'precio_variable_tope'>('precio_fijo')
  const [descripcion, setDescripcion]     = useState('')
  const [fechaInicio, setFechaInicio]     = useState('')
  const [fechaFin, setFechaFin]           = useState('')
  const [presupuesto, setPresupuesto]     = useState('')
  const [referencia, setReferencia]       = useState('')
  const [areasSeleccionadas, setAreasSeleccionadas] = useState<string[]>([])
  const [items, setItems]                 = useState<ItemForm[]>([{ ...ITEM_VACIO }])

  // Spec: HU-019 CA-02/CA-03 — origen desde una NP (prellenado vía Líneas Pendientes de OC)
  const [npOrigenId, setNpOrigenId]       = useState<string | null>(null)
  const [npOrigenNumero, setNpOrigenNumero] = useState<string | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/compras/areas').then(r => r.ok ? r.json() : []),
      fetch('/api/compras/proveedores?activo=true&limit=200').then(r => r.ok ? r.json() : []),
    ]).then(([areasData, provData]) => {
      setAreas(Array.isArray(areasData) ? areasData : [])
      setProveedores((provData.proveedores ?? provData ?? []))
    })

    // Spec: HU-019 CA-02 — prellenado desde Líneas Pendientes de OC
    const desdeItems = searchParams.get('desde_items')
    if (!desdeItems) return

    fetch(`/api/compras/nps/lineas-pendientes/prellenado-oca?items=${encodeURIComponent(desdeItems)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        np_id: string; np_numero: string
        items: { codigo: string; descripcion: string; unidad: string; precio_unitario: number | null; proveedor_sugerido: string | null; item_np_id: string }[]
      } | null) => {
        if (!data) { setError('No se pudo cargar el prellenado — las líneas ya no están disponibles'); return }
        setNpOrigenId(data.np_id)
        setNpOrigenNumero(data.np_numero)
        setItems(data.items.map(it => ({
          codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad,
          categoria: '', precio_unitario: it.precio_unitario !== null ? String(it.precio_unitario) : '',
          precio_maximo: '', item_np_id: it.item_np_id,
        })))

        // Spec: HU-019 CA-02, mismo patrón que ModalGenerarOC (HU-014 CA-07) —
        // coincidencia exacta solo si TODAS las líneas comparten el mismo
        // proveedor_sugerido no vacío.
        const sugeridos = new Set(
          data.items.map(it => (it.proveedor_sugerido ?? '').trim().toLowerCase()).filter(s => s !== '')
        )
        if (sugeridos.size !== 1) return
        const sugerido = data.items[0].proveedor_sugerido!.trim()
        if (sugerido.length < 2) return

        fetch(`/api/compras/proveedores?q=${encodeURIComponent(sugerido)}`)
          .then(r => r.ok ? r.json() : [])
          .then((candidatos: Proveedor[]) => {
            const exactos = candidatos.filter(p => p.nombre.trim().toLowerCase() === sugerido.toLowerCase())
            if (exactos.length === 1) setProveedorId(exactos[0].id)
          })
          .catch(() => {})
      })
      .catch(() => setError('Error al cargar el prellenado desde Líneas Pendientes de OC'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))
  }

  function toggleArea(areaId: string) {
    setAreasSeleccionadas(prev =>
      prev.includes(areaId) ? prev.filter(a => a !== areaId) : [...prev, areaId]
    )
  }

  async function handleGuardar() {
    setError('')
    if (!proveedorId || !descripcion || !fechaInicio || !fechaFin || !presupuesto || !referencia) {
      setError('Completa todos los campos obligatorios de la cabecera'); return
    }
    for (const it of items) {
      if (!it.codigo || !it.descripcion || !it.unidad) {
        setError('Cada ítem requiere código, descripción y unidad'); return
      }
      if (tipo === 'precio_fijo' && !it.precio_unitario) {
        setError(`El ítem ${it.codigo} requiere precio unitario (tipo precio fijo)`); return
      }
      if (tipo === 'precio_variable_tope' && !it.precio_maximo) {
        setError(`El ítem ${it.codigo} requiere precio máximo (tipo precio variable con tope)`); return
      }
    }

    setGuardando(true)
    const res = await fetch('/api/compras/ocas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: proveedorId,
        tipo,
        descripcion,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        presupuesto_total: Number(presupuesto),
        referencia_contractual: referencia,
        areas_habilitadas: areasSeleccionadas,
        ...(npOrigenId ? { np_origen_id: npOrigenId } : {}),
        items: items.map(it => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          categoria: it.categoria || undefined,
          precio_unitario: tipo === 'precio_fijo' ? Number(it.precio_unitario) : undefined,
          precio_maximo: tipo === 'precio_variable_tope' ? Number(it.precio_maximo) : undefined,
          ...(it.item_np_id ? { item_np_id: it.item_np_id } : {}),
        })),
      }),
    })
    const data = await res.json()
    setGuardando(false)
    if (res.ok) {
      router.push(`/compras/ocas/${data.id}`)
    } else {
      setError(data.error || 'Error al crear la OCA')
    }
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nueva Orden de Compra Abierta</h1>
          <p className="text-slate-500 text-sm mt-0.5">Se crea en estado Borrador — podrás editarla antes de enviarla a aprobación</p>
        </div>

        {npOrigenNumero && (
          <div className="bg-teal-50 border border-teal-200 rounded px-3 py-2 text-sm text-teal-800">
            Lista de precios prellenada desde las líneas seleccionadas de <strong>{npOrigenNumero}</strong>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Datos del acuerdo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Proveedor *</Label>
                <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                  <option value="">Seleccionar...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Tipo de OCA *</Label>
                <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}
                  className="w-full border rounded px-3 py-1.5 text-sm mt-1">
                  <option value="precio_fijo">Precio fijo</option>
                  <option value="precio_variable_tope">Precio variable (con tope)</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Descripción *</Label>
              <Input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className="mt-1 h-8 text-sm" placeholder="Ej: Ferretería general campo Oriente" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Fecha de inicio *</Label>
                <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Fecha de fin *</Label>
                <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Presupuesto total (USD) *</Label>
                <Input type="number" min="0" step="0.01" value={presupuesto} onChange={e => setPresupuesto(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Referencia contractual *</Label>
              <Input value={referencia} onChange={e => setReferencia(e.target.value)} className="mt-1 h-8 text-sm" placeholder="N° de contrato o acuerdo" />
            </div>
            <div>
              <Label className="text-xs">Áreas habilitadas (Centro de Costo)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {areas.map(a => (
                  <button key={a.id} type="button" onClick={() => toggleArea(a.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      areasSeleccionadas.includes(a.id)
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
                onClick={() => setItems(prev => [...prev, { ...ITEM_VACIO }])}>
                + Agregar ítem
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end border-b pb-3 last:border-0">
                <div>
                  <Label className="text-xs">Código</Label>
                  <Input value={it.codigo} onChange={e => actualizarItem(idx, 'codigo', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Descripción</Label>
                  <Input value={it.descripcion} onChange={e => actualizarItem(idx, 'descripcion', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Unidad</Label>
                  <Input value={it.unidad} onChange={e => actualizarItem(idx, 'unidad', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                {tipo === 'precio_fijo' ? (
                  <div>
                    <Label className="text-xs">Precio unitario</Label>
                    <Input type="number" min="0" step="0.01" value={it.precio_unitario}
                      onChange={e => actualizarItem(idx, 'precio_unitario', e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Precio máximo</Label>
                    <Input type="number" min="0" step="0.01" value={it.precio_maximo}
                      onChange={e => actualizarItem(idx, 'precio_maximo', e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                )}
                <div className="flex items-end">
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-500 hover:underline h-8">Quitar</button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <Button onClick={handleGuardar} disabled={guardando} className="btn-primary">
            {guardando ? 'Guardando...' : 'Guardar borrador'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/compras/ocas')}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}
