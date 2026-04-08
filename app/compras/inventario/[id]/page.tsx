'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const AREAS = [
  'Operaciones - Bombeo Mecánico', 'Operaciones - Servicio Eléctrico', 'Operaciones - Niveles',
  'Compras', 'QHSE', 'TTHH', 'Finanzas', 'Gerencia', 'Ventas',
]

export default function EditarItemPage() {
  const params = useParams()
  const id     = params.id as string

  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [msg, setMsg]             = useState('')
  const [form, setForm] = useState({
    codigo:             '',
    descripcion:        '',
    area:               '',
    categoria:          '',
    saldo_existencias:  '0',
    costo_unitario:     '0',
    locacion:           '',
    codigo_origen:      '',
    descripcion_origen: '',
    marca:              '',
  })

  useEffect(() => {
    fetch(`/api/inventario/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setForm({
          codigo:             data.codigo             ?? '',
          descripcion:        data.descripcion        ?? '',
          area:               data.area               ?? '',
          categoria:          data.categoria          ?? '',
          saldo_existencias:  String(data.saldo_existencias  ?? 0),
          costo_unitario:     String(data.costo_unitario     ?? 0),
          locacion:           data.locacion           ?? '',
          codigo_origen:      data.codigo_origen      ?? '',
          descripcion_origen: data.descripcion_origen ?? '',
          marca:              data.marca              ?? '',
        })
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })
  }, [id])

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleGuardar() {
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      setError('Código y descripción son requeridos')
      return
    }
    setGuardando(true); setError(''); setMsg('')
    try {
      const res  = await fetch(`/api/inventario/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          saldo_existencias: Number(form.saldo_existencias) || 0,
          costo_unitario:    Number(form.costo_unitario)    || 0,
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
        <Card>
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
                <Label className="text-xs">Categoría</Label>
                <Input value={form.categoria} onChange={e => setField('categoria', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Área</Label>
                <select value={form.area} onChange={e => setField('area', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Sin área</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Saldo Existencias</Label>
                <Input type="number" step="0.01" min="0" value={form.saldo_existencias} onChange={e => setField('saldo_existencias', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Costo Unitario USD</Label>
                <Input type="number" step="0.01" min="0" value={form.costo_unitario} onChange={e => setField('costo_unitario', e.target.value)} className="mt-1 h-8 text-sm" />
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

            <div>
              <Label className="text-xs">Descripción Origen</Label>
              <Input value={form.descripcion_origen} onChange={e => setField('descripcion_origen', e.target.value)} className="mt-1 h-8 text-sm" />
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
