'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CLASIFICACIONES = ['CRITICO', 'NO CRITICO', 'EVENTUAL']

export default function EditarProveedorPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [msg, setMsg]             = useState('')
  const [form, setForm] = useState({
    nombre:        '',
    clasificacion: '',
    categoria:     '',
    ciudad:        '',
    direccion:     '',
    telefono:      '',
    email:         '',
    contacto:      '',
    activo:        true,
  })

  useEffect(() => {
    fetch(`/api/proveedores/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setForm({
          nombre:        data.nombre        ?? '',
          clasificacion: data.clasificacion ?? '',
          categoria:     data.categoria     ?? '',
          ciudad:        data.ciudad        ?? '',
          direccion:     data.direccion     ?? '',
          telefono:      data.telefono      ?? '',
          email:         data.email         ?? '',
          contacto:      data.contacto      ?? '',
          activo:        data.activo        ?? true,
        })
        setCargando(false)
      })
      .catch(() => { setError('Error de conexión'); setCargando(false) })
  }, [id])

  function setField(key: string, val: string | boolean) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    setGuardando(true); setError(''); setMsg('')
    try {
      const res  = await fetch(`/api/proveedores/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        setMsg('✓ Proveedor actualizado correctamente')
      } else {
        setError(data.error || 'Error al guardar')
      }
    } catch { setError('Error de conexión') }
    finally   { setGuardando(false) }
  }

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>

  if (error && !form.nombre) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="text-center space-y-3">
        <p>{error}</p>
        <Link href="/compras/proveedores" className="text-blue-600 text-sm hover:underline">← Volver</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-800 text-white px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <Link href="/compras/proveedores" className="text-blue-300 text-xs hover:text-white">← Proveedores</Link>
          <h1 className="text-xl font-bold mt-1">Editar Proveedor</h1>
          <p className="text-blue-300 text-sm mt-0.5">{form.nombre}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-slate-700">Datos del Proveedor</CardTitle>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={e => setField('activo', e.target.checked)}
                  className="rounded"
                />
                Activo
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input value={form.nombre} onChange={e => setField('nombre', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Clasificación</Label>
                <select value={form.clasificacion} onChange={e => setField('clasificacion', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Sin clasificación</option>
                  {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <Input value={form.categoria} onChange={e => setField('categoria', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Ciudad</Label>
                <Input value={form.ciudad} onChange={e => setField('ciudad', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input value={form.telefono} onChange={e => setField('telefono', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Contacto</Label>
                <Input value={form.contacto} onChange={e => setField('contacto', e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Dirección</Label>
              <Input value={form.direccion} onChange={e => setField('direccion', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            {msg   && <p className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleGuardar} disabled={guardando} className="flex-1 bg-blue-700 hover:bg-blue-800">
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
              <Link href="/compras/proveedores">
                <Button variant="outline">Volver</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
