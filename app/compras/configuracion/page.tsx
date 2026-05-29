'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Secuencia = { año: number; ultimo_numero: number }

function PanelSecuencia() {
  const [secuencias, setSecuencias]       = useState<Secuencia[]>([])
  const [año, setAño]                     = useState(String(new Date().getFullYear()))
  const [numeroInicial, setNumeroInicial] = useState('1')
  const [guardando, setGuardando]         = useState(false)
  const [msg, setMsg]                     = useState('')

  function cargarSecuencias() {
    fetch('/api/compras/secuencia').then(r => r.json()).then(d => setSecuencias(Array.isArray(d) ? d : []))
  }

  useEffect(() => { cargarSecuencias() }, [])

  async function handleGuardar() {
    setGuardando(true)
    setMsg('')
    const res = await fetch('/api/compras/secuencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ año: Number(año), numero_inicial: Number(numeroInicial) }),
    })
    const data = await res.json()
    if (data.success) {
      setMsg(`✓ Próxima NP del ${año} será NP-${año}-${String(data.proximo).padStart(4, '0')}`)
      cargarSecuencias()
    } else {
      setMsg(`Error: ${data.error}`)
    }
    setGuardando(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-700">Numeración de NPs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Año</Label>
            <Input type="number" value={año} onChange={e => setAño(e.target.value)} className="mt-1 h-8 text-sm" min={2024} max={2099} />
          </div>
          <div>
            <Label className="text-xs">Número inicial (próxima NP)</Label>
            <Input type="number" value={numeroInicial} onChange={e => setNumeroInicial(e.target.value)} className="mt-1 h-8 text-sm" min={1} />
          </div>
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 btn-primary text-sm">
            {guardando ? 'Guardando...' : 'Establecer'}
          </Button>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
        {secuencias.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500 uppercase">
                  <th className="text-left py-2">Año</th>
                  <th className="text-left py-2">Último número emitido</th>
                  <th className="text-left py-2">Próximo</th>
                </tr>
              </thead>
              <tbody>
                {secuencias.map(s => (
                  <tr key={s.año} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.año}</td>
                    <td className="py-2 font-mono">NP-{s.año}-{String(s.ultimo_numero).padStart(4, '0')}</td>
                    <td className="py-2 font-mono text-blue-600">NP-{s.año}-{String(s.ultimo_numero + 1).padStart(4, '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PanelSecuenciaOC() {
  const [secuencias, setSecuencias]       = useState<Secuencia[]>([])
  const [año, setAño]                     = useState(String(new Date().getFullYear()))
  const [numeroInicial, setNumeroInicial] = useState('1')
  const [guardando, setGuardando]         = useState(false)
  const [msg, setMsg]                     = useState('')

  function cargarSecuencias() {
    fetch('/api/compras/secuencia-oc').then(r => r.json()).then(d => setSecuencias(Array.isArray(d) ? d : []))
  }

  useEffect(() => { cargarSecuencias() }, [])

  async function handleGuardar() {
    setGuardando(true)
    setMsg('')
    const res = await fetch('/api/compras/secuencia-oc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ año: Number(año), numero_inicial: Number(numeroInicial) }),
    })
    const data = await res.json()
    if (data.success) {
      setMsg(`✓ Próxima OC del ${año} será OC-${año}-${String(data.proximo).padStart(4, '0')}`)
      cargarSecuencias()
    } else {
      setMsg(`Error: ${data.error}`)
    }
    setGuardando(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-700">Numeración de OCs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Año</Label>
            <Input type="number" value={año} onChange={e => setAño(e.target.value)} className="mt-1 h-8 text-sm" min={2024} max={2099} />
          </div>
          <div>
            <Label className="text-xs">Número inicial (próxima OC)</Label>
            <Input type="number" value={numeroInicial} onChange={e => setNumeroInicial(e.target.value)} className="mt-1 h-8 text-sm" min={1} />
          </div>
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 btn-primary text-sm">
            {guardando ? 'Guardando...' : 'Establecer'}
          </Button>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
        {secuencias.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500 uppercase">
                  <th className="text-left py-2">Año</th>
                  <th className="text-left py-2">Última OC emitida</th>
                  <th className="text-left py-2">Próxima</th>
                </tr>
              </thead>
              <tbody>
                {secuencias.map(s => (
                  <tr key={s.año} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.año}</td>
                    <td className="py-2 font-mono">OC-{s.año}-{String(s.ultimo_numero).padStart(4, '0')}</td>
                    <td className="py-2 font-mono text-blue-600">OC-{s.año}-{String(s.ultimo_numero + 1).padStart(4, '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type Empresa = {
  razon_social: string
  ruc: string | null
  direccion: string | null
  contacto: string | null
  telefono: string | null
  email: string | null
  documento_numero_oc: string | null
  revision_oc: string | null
}

function PanelEmpresa() {
  const [form, setForm]         = useState<Empresa>({ razon_social: '', ruc: '', direccion: '', contacto: '', telefono: '', email: '', documento_numero_oc: '', revision_oc: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]           = useState('')
  const [cargando, setCargando] = useState(true)

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

  if (cargando) return <Card><CardContent className="pt-4 text-sm text-slate-400">Cargando...</CardContent></Card>

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-700">Datos de Empresa (FACTURAR A)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label className="text-xs">Razón Social *</Label>
            <Input value={form.razon_social} onChange={e => setField('razon_social', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">RUC</Label>
            <Input value={form.ruc ?? ''} onChange={e => setField('ruc', e.target.value)} className="mt-1 h-8 text-sm font-mono" />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.telefono ?? ''} onChange={e => setField('telefono', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Contacto</Label>
            <Input value={form.contacto ?? ''} onChange={e => setField('contacto', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email ?? ''} onChange={e => setField('email', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Dirección</Label>
            <Input value={form.direccion ?? ''} onChange={e => setField('direccion', e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Código Formulario OC</Label>
            <Input value={form.documento_numero_oc ?? ''} onChange={e => setField('documento_numero_oc', e.target.value)} className="mt-1 h-8 text-sm font-mono" placeholder="AL-L4-07-F01" />
          </div>
          <div>
            <Label className="text-xs">Revisión OC</Label>
            <Input type="number" min={1} value={form.revision_oc ?? ''} onChange={e => setField('revision_oc', e.target.value)} className="mt-1 h-8 text-sm" placeholder="1" />
          </div>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
        <Button onClick={handleGuardar} disabled={guardando} className="h-8 btn-primary text-sm">
          {guardando ? 'Guardando...' : 'Guardar Datos de Empresa'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function ConfiguracionPage() {
  const [rol, setRol] = useState('')

  useEffect(() => {
    fetch('/api/auth/perfil').then(r => r.json()).then(d => { if (d?.rol) setRol(d.rol) })
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-5">Configuración</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelSecuencia />
        <PanelSecuenciaOC />
        {rol === 'admin' && <PanelEmpresa />}
      </div>
    </div>
  )
}
