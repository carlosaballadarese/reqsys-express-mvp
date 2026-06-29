'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Empresa = {
  razon_social:        string
  ruc:                 string | null
  direccion:           string | null
  contacto:            string | null
  telefono:            string | null
  email:               string | null
  documento_numero_oc: string | null
  revision_oc:         string | null
  documento_numero_np: string | null
  revision_np:         string | null
}

export default function EmpresaPage() {
  const [form, setForm]         = useState<Empresa>({
    razon_social: '', ruc: '', direccion: '', contacto: '',
    telefono: '', email: '', documento_numero_oc: '', revision_oc: '',
    documento_numero_np: '', revision_np: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]             = useState('')
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    fetch('/api/compras/configuracion/empresa')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setForm({
          razon_social:        data.razon_social        ?? '',
          ruc:                 data.ruc                 ?? '',
          direccion:           data.direccion           ?? '',
          contacto:            data.contacto            ?? '',
          telefono:            data.telefono            ?? '',
          email:               data.email               ?? '',
          documento_numero_oc: data.documento_numero_oc ?? 'AL-L4-07-F01',
          revision_oc:         data.revision_oc != null  ? String(data.revision_oc) : '1',
          documento_numero_np: data.documento_numero_np ?? 'AL-L4-07-F01',
          revision_np:         data.revision_np != null  ? String(data.revision_np) : '1',
        })
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [])

  function setField(key: keyof Empresa, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleGuardar() {
    if (!form.razon_social.trim()) { setMsg('Error: La razón social es requerida'); return }
    setGuardando(true); setMsg('')
    const res = await fetch('/api/compras/configuracion/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setMsg(data.success ? '✓ Datos de empresa actualizados' : `Error: ${data.error}`)
    setGuardando(false)
  }

  if (cargando) return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <p className="text-sm text-slate-400">Cargando...</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-5">Datos de Empresa</h1>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">FACTURAR A — Información de ARLIFT S.A.</CardTitle>
          <p className="text-xs text-slate-400 mt-0.5">
            Estos datos aparecen en el bloque "FACTURAR A" de todas las Órdenes de Compra generadas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs">Razón Social *</Label>
              <Input
                value={form.razon_social}
                onChange={e => setField('razon_social', e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="Ej. ARLIFT ENGINEERING & SERVICES S.A."
              />
            </div>
            <div>
              <Label className="text-xs">RUC</Label>
              <Input
                value={form.ruc ?? ''}
                onChange={e => setField('ruc', e.target.value)}
                className="mt-1 h-8 text-sm font-mono"
                placeholder="0000000000001"
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={form.telefono ?? ''}
                onChange={e => setField('telefono', e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Contacto</Label>
              <Input
                value={form.contacto ?? ''}
                onChange={e => setField('contacto', e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={e => setField('email', e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Dirección</Label>
              <Input
                value={form.direccion ?? ''}
                onChange={e => setField('direccion', e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">Numeración de Documentos OC</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Código Formulario OC</Label>
                <Input
                  value={form.documento_numero_oc ?? ''}
                  onChange={e => setField('documento_numero_oc', e.target.value)}
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="AL-L4-07-F01"
                />
              </div>
              <div>
                <Label className="text-xs">Revisión OC</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.revision_oc ?? ''}
                  onChange={e => setField('revision_oc', e.target.value)}
                  className="mt-1 h-8 text-sm"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">Numeración de Documentos NP</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Código Formulario NP</Label>
                <Input
                  value={form.documento_numero_np ?? ''}
                  onChange={e => setField('documento_numero_np', e.target.value)}
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="AL-L4-07-F01"
                />
              </div>
              <div>
                <Label className="text-xs">Revisión NP</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.revision_np ?? ''}
                  onChange={e => setField('revision_np', e.target.value)}
                  className="mt-1 h-8 text-sm"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          {msg && (
            <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {msg}
            </p>
          )}
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 btn-primary text-sm">
            {guardando ? 'Guardando...' : 'Guardar Datos de Empresa'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
