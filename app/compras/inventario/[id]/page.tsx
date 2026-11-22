'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ComboConAlta } from '@/components/ComboConAlta'

export default function EditarItemPage() {
  const params = useParams()
  const id     = params.id as string

  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [msg, setMsg]             = useState('')
  const [areas, setAreas]         = useState<{ id: string; nombre: string }[]>([])
  // Spec: HU-027 CA-01b — áreas habilitadas para Bodega (ayuda de UX), nunca
  // se persiste en el producto.
  const [areasBodega, setAreasBodega] = useState<{ id: string; nombre: string }[]>([])
  const [areaFiltro, setAreaFiltro]   = useState('')
  const [bodegas, setBodegas]         = useState<{ id: string; nombre: string }[]>([])
  const [categorias, setCategorias]   = useState<{ id: string; nombre: string }[]>([])
  // Spec: HU-027 CA-04/CA-05 — solo lectura, nunca se envían en el PUT.
  const [saldoExistencias, setSaldoExistencias] = useState(0)
  const [costoUnitario, setCostoUnitario]       = useState(0)
  const [form, setForm] = useState({
    codigo:             '',
    descripcion:        '',
    area:               '',
    categoria:          '',
    locacion:           '',
    codigo_origen:      '',
    descripcion_origen: '',
    marca:              '',
    observaciones:      '',
    bodega_id:          '',
    categoria_id:       '',
    stock_minimo:       '',
    stock_maximo:       '',
    unidad:             'EA',
    requiere_guia:      'true',
  })

  useEffect(() => {
    fetch(`/api/compras/inventario/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setForm({
          codigo:             data.codigo             ?? '',
          descripcion:        data.descripcion        ?? '',
          area:               data.area               ?? '',
          categoria:          data.categoria          ?? '',
          locacion:           data.locacion           ?? '',
          codigo_origen:      data.codigo_origen      ?? '',
          descripcion_origen: data.descripcion_origen ?? '',
          marca:              data.marca              ?? '',
          observaciones:      data.observaciones      ?? '',
          bodega_id:          data.bodega_id           ?? '',
          categoria_id:       data.categoria_id        ?? '',
          stock_minimo:       data.stock_minimo != null ? String(data.stock_minimo) : '',
          stock_maximo:       data.stock_maximo != null ? String(data.stock_maximo) : '',
          unidad:             data.unidad ?? 'EA',
          requiere_guia:      data.requiere_guia === false ? 'false' : 'true',
        })
        setSaldoExistencias(Number(data.saldo_existencias ?? 0))
        setCostoUnitario(Number(data.costo_unitario ?? 0))
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })

    fetch('/api/compras/areas').then(r => r.json()).then(setAreas).catch(console.error)
    fetch('/api/compras/areas?solo_bodega=1').then(r => r.json()).then(setAreasBodega).catch(console.error)
    fetch('/api/compras/bodega/bodegas').then(r => r.json()).then(setBodegas).catch(console.error)
  }, [id])

  useEffect(() => {
    const url = areaFiltro
      ? `/api/compras/bodega/categorias?area_id=${areaFiltro}`
      : '/api/compras/bodega/categorias'
    fetch(url).then(r => r.json()).then(setCategorias).catch(console.error)
  }, [areaFiltro])

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleGuardar() {
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      setError('Código y descripción son requeridos')
      return
    }
    setGuardando(true); setError(''); setMsg('')
    try {
      const res  = await fetch(`/api/compras/inventario/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          bodega_id:    form.bodega_id    || null,
          categoria_id: form.categoria_id || null,
          stock_minimo: form.stock_minimo,
          stock_maximo: form.stock_maximo,
          requiere_guia: form.requiere_guia !== 'false',
          unidad:        form.unidad,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg('✓ Ítem actualizado correctamente')
      } else {
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexión') }
    finally   { setGuardando(false) }
  }

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>

  if (error && !form.codigo) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="text-center space-y-3">
        <p>{error}</p>
        <Link href="/compras/inventario" className="text-blue-600 text-sm hover:underline">← Volver</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <Link href="/compras/inventario" className="text-blue-300 text-xs hover:text-white">← Inventario</Link>
          <h1 className="text-xl font-bold mt-1">Editar Ítem</h1>
          <p className="text-blue-300 text-sm mt-0.5 font-mono">{form.codigo} — {form.descripcion}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <Card className="overflow-visible">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Datos del Ítem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Código *</Label>
                <Input value={form.codigo} onChange={e => setField('codigo', e.target.value)} className="mt-1 h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Marca</Label>
                <Input value={form.marca} onChange={e => setField('marca', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Descripción *</Label>
              <Input value={form.descripcion} onChange={e => setField('descripcion', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Categoría (texto legado)</Label>
                <Input value={form.categoria} onChange={e => setField('categoria', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Área (texto legado)</Label>
                <select value={form.area} onChange={e => setField('area', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Sin área</option>
                  {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                {/* Spec: HU-027 CA-05 — solo lectura, derivado del Kardex (HU-028) */}
                <Label className="text-xs">Saldo Existencias</Label>
                <p className="mt-1 h-8 flex items-center text-sm text-slate-500">{saldoExistencias}</p>
              </div>
              <div>
                {/* Spec: HU-027 CA-04 — solo lectura, derivado del Kardex (HU-028) */}
                <Label className="text-xs">Costo Unitario USD</Label>
                <p className="mt-1 h-8 flex items-center text-sm text-slate-500">${costoUnitario.toFixed(2)}</p>
              </div>
              <div>
                <Label className="text-xs">Locación</Label>
                <Input value={form.locacion} onChange={e => setField('locacion', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Código Origen</Label>
                <Input value={form.codigo_origen} onChange={e => setField('codigo_origen', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            </div>

            {/* Spec: HU-027 CA-01/CA-01b — catálogos normalizados de Bodega */}
            <div className="border-t pt-4">
              <p className="text-xs font-medium text-slate-500 mb-3">Clasificación de Bodega</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ComboConAlta
                  label="Bodega"
                  value={form.bodega_id}
                  onChange={(id) => setField('bodega_id', id)}
                  opciones={bodegas}
                  onCreado={(nuevo) => setBodegas((prev) => [...prev, nuevo])}
                  crearEndpoint="/api/compras/bodega/bodegas"
                  construirBody={(nombre, extra) => ({ nombre, codigo: extra.codigo, referencia: extra.referencia || null })}
                  placeholderOpcionVacia="Sin asignar"
                  camposExtra={[{ key: 'codigo', label: 'Código', requerido: true }, { key: 'referencia', label: 'Referencia (opcional)' }]}
                />
                <div>
                  <Label className="text-xs">Área (para filtrar Categoría — no se guarda)</Label>
                  <select value={areaFiltro} onChange={e => setAreaFiltro(e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Todas las categorías</option>
                    {areasBodega.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Categoría (normalizada)</Label>
                  <select value={form.categoria_id} onChange={e => setField('categoria_id', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Sin asignar</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div />
                <div>
                  <Label className="text-xs">Stock Mínimo</Label>
                  <Input type="number" step="0.01" min="0" value={form.stock_minimo} onChange={e => setField('stock_minimo', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Stock Máximo</Label>
                  <Input type="number" step="0.01" min="0" value={form.stock_maximo} onChange={e => setField('stock_maximo', e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <Label className="text-xs">Unidad de medida</Label>
                  <Input value={form.unidad} onChange={e => setField('unidad', e.target.value)} placeholder="EA, M, KG..." className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">¿Requiere guía de remisión?</Label>
                  <select value={form.requiere_guia} onChange={e => setField('requiere_guia', e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                    <option value="true">Sí</option>
                    <option value="false">No (consumo interno)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Descripción Origen</Label>
              <Input value={form.descripcion_origen} onChange={e => setField('descripcion_origen', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            <div>
              <Label className="text-xs">Observaciones</Label>
              <textarea
                value={form.observaciones}
                onChange={e => setField('observaciones', e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none"
                placeholder="Observaciones adicionales..."
              />
            </div>

            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            {msg   && <p className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleGuardar} disabled={guardando} className="flex-1 btn-primary">
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
              <Link href="/compras/inventario">
                <Button variant="outline">Volver</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
