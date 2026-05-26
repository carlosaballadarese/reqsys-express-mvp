'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CLASIFICACIONES = ['CRITICO', 'NO CRITICO', 'EVENTUAL']

function validarRucUI(ruc: string): string {
  if (!ruc) return ''
  if (!/^\d{13}$/.test(ruc)) return 'El RUC debe tener exactamente 13 dígitos'
  const prov = parseInt(ruc.substring(0, 2), 10)
  if (prov < 1 || prov > 24) return 'Los primeros 2 dígitos deben ser una provincia válida (01-24)'
  const tercer = parseInt(ruc[2], 10)
  if (tercer > 6 && tercer !== 9) return 'El tercer dígito debe ser 0-6 o 9'
  return ''
}

export default function EditarProveedorPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [msg, setMsg]             = useState('')
  const [rucError, setRucError]   = useState('')
  const [form, setForm] = useState({
    nombre:        '',
    ruc:           '',
    clasificacion: '',
    categoria:     '',
    ciudad:        '',
    giro_negocio:  '',
    direccion:     '',
    telefono:      '',
    email:         '',
    contacto:      '',
    activo:        true,
  })

  useEffect(() => {
    fetch(`/api/compras/proveedores/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setForm({
          nombre:        data.nombre        ?? '',
          ruc:           data.ruc           ?? '',
          clasificacion: data.clasificacion ?? '',
          categoria:     data.categoria     ?? '',
          ciudad:        data.ciudad        ?? '',
          giro_negocio:  data.giro_negocio  ?? '',
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

  function handleRucChange(val: string) {
    setField('ruc', val)
    setRucError(val ? validarRucUI(val) : '')
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    if (form.ruc && rucError) { setError(rucError); return }
    setGuardando(true); setError(''); setMsg('')
    try {
      const res  = await fetch(`/api/compras/proveedores/${id}`, {
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
      <div className="page-header px-6 py-5">
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
              <Label className="text-xs">Nombre / Razón Social *</Label>
              <Input value={form.nombre} onChange={e => setField('nombre', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">RUC</Label>
                <Input
                  value={form.ruc}
                  onChange={e => handleRucChange(e.target.value)}
                  className={`mt-1 h-8 text-sm font-mono ${rucError ? 'border-red-400' : ''}`}
                  placeholder="0000000000001"
                  maxLength={13}
                />
                {rucError && <p className="text-red-500 text-xs mt-0.5">{rucError}</p>}
              </div>
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
              <Label className="text-xs">Giro del Negocio</Label>
              <Input value={form.giro_negocio} onChange={e => setField('giro_negocio', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Ej: Alquiler de transporte y grúas..." />
            </div>

            <div>
              <Label className="text-xs">Dirección</Label>
              <Input value={form.direccion} onChange={e => setField('direccion', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>

            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            {msg   && <p className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleGuardar} disabled={guardando} className="flex-1 btn-primary">
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
