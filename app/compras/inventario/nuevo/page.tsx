'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ComboConAlta } from '@/components/ComboConAlta'

export default function NuevoItemPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Spec: hallazgo real de usuario (2026-11-22) — si se llegó desde "+ Crear
  // producto nuevo" de un formulario de Bodega (Ingreso/Egreso/Ensamblaje),
  // al guardar (o cancelar) se vuelve automáticamente a ese formulario sin
  // perder lo que ya tenía ingresado (el borrador vive en sessionStorage,
  // identificado por volverDraft — ver lib/bodega-draft-producto.ts).
  const volver = searchParams.get('volver')
  const volverDraft = searchParams.get('volverDraft')
  const urlCancelar = volver && volverDraft
    ? `${volver}?${new URLSearchParams({ volverDraft }).toString()}`
    : '/compras/inventario'

  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  // Spec: HU-027 CA-01b — áreas habilitadas para Bodega (ayuda de UX para
  // filtrar Categoría); nunca se persiste en el producto.
  const [areasBodega, setAreasBodega] = useState<{ id: string; nombre: string }[]>([])
  const [areaFiltro, setAreaFiltro]   = useState('')
  const [bodegas, setBodegas]         = useState<{ id: string; nombre: string; codigo?: string }[]>([])
  const [categorias, setCategorias]   = useState<{ id: string; nombre: string }[]>([])
  // Spec: HU-045 CA-02 — no pisar un código que el usuario ya editó a mano.
  const [codigoTocado, setCodigoTocado] = useState(false)
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

  // Cargar catálogos (el código sugerido se resuelve en el efecto de abajo,
  // una vez se conoce la Bodega elegida — Spec: HU-045 CA-02)
  useEffect(() => {
    fetch('/api/compras/areas?solo_bodega=1').then(r => r.json()).then(setAreasBodega).catch(console.error)
    fetch('/api/compras/bodega/bodegas').then(r => r.json()).then(setBodegas).catch(console.error)
  }, [])

  // Spec: hallazgo real de usuario (2026-11-27) — "Categoría (texto legado)"
  // y "Área (texto legado)" seguían vivos (los usa el buscador de NP/OC y el
  // filtro del listado de Inventario), pero mostrarlos junto a la Categoría
  // normalizada obligaba a cargar el mismo dato 2 veces. Se derivan solos
  // desde la selección normalizada — el usuario ya no los ve ni los toca.
  useEffect(() => {
    const cat = categorias.find((c) => c.id === form.categoria_id)
    setForm((f) => ({ ...f, categoria: cat?.nombre ?? '' }))
  }, [form.categoria_id, categorias])

  useEffect(() => {
    const ar = areasBodega.find((a) => a.id === areaFiltro)
    setForm((f) => ({ ...f, area: ar?.nombre ?? '' }))
  }, [areaFiltro, areasBodega])

  // Spec: HU-045 CA-02 — sugiere el próximo código usando el prefijo real de
  // la Bodega elegida (su campo "Código", ej. AL-I/AL-C); sin Bodega elegida
  // todavía, mantiene el default histórico AL-I. Nunca pisa un código que el
  // usuario ya haya editado a mano (codigoTocado).
  useEffect(() => {
    if (codigoTocado) return
    const bodegaElegida = bodegas.find(b => b.id === form.bodega_id)
    const prefijo = bodegaElegida?.codigo || 'AL-I'
    fetch(`/api/compras/inventario/next-codigo?prefijo=${encodeURIComponent(prefijo)}`)
      .then(r => r.json())
      .then(data => { if (data.codigo) setForm(f => ({ ...f, codigo: data.codigo })) })
      .catch(() => {})
  }, [form.bodega_id, bodegas, codigoTocado])

  // Spec: HU-027 CA-01b — el selector de Categoría se acota según el Área
  // elegida en el filtro de UX; sin filtro, lista todas las categorías activas.
  useEffect(() => {
    const url = areaFiltro
      ? `/api/compras/bodega/categorias?area_id=${areaFiltro}`
      : '/api/compras/bodega/categorias'
    fetch(url).then(r => r.json()).then(setCategorias).catch(console.error)
  }, [areaFiltro])

  function setField(key: string, val: string) {
    if (key === 'codigo') setCodigoTocado(true)
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleGuardar() {
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      setError('Código y descripción son requeridos')
      return
    }
    setGuardando(true); setError('')
    try {
      const res  = await fetch('/api/compras/inventario', {
        method: 'POST',
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
        if (volver && volverDraft) {
          const params = new URLSearchParams({
            volverDraft,
            producto_creado_id: data.item.id,
            producto_creado_codigo: data.item.codigo,
            producto_creado_descripcion: data.item.descripcion,
          })
          router.push(`${volver}?${params.toString()}`)
        } else {
          router.push('/compras/inventario')
        }
      } else {
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexión') }
    finally   { setGuardando(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <Link href={urlCancelar} className="text-blue-300 text-xs hover:text-white">← {volver ? 'Volver' : 'Inventario'}</Link>
          <h1 className="text-xl font-bold mt-1">Nuevo Ítem de Inventario</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <Card className="overflow-visible">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">Datos del Ítem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {volver && (
              <p className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-3 py-2">
                Estás creando este producto para completar un documento en curso. Al guardar (o cancelar) volverás automáticamente, sin perder lo que ya habías ingresado ahí.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Código *</Label>
                <Input value={form.codigo} onChange={e => setField('codigo', e.target.value)} className="mt-1 h-8 text-sm font-mono" placeholder="AL-I0001" />
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
                  <Label className="text-xs">Locación</Label>
                  <Input value={form.locacion} onChange={e => setField('locacion', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Ej: Almacén A - Estante 3" />
                </div>
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

            <div className="flex gap-3 pt-2">
              <Button onClick={handleGuardar} disabled={guardando} className="flex-1 btn-primary">
                {guardando ? 'Guardando...' : 'Registrar Ítem'}
              </Button>
              <Link href={urlCancelar}>
                <Button variant="outline">Cancelar</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
