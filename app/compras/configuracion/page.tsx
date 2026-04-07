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
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 bg-blue-700 hover:bg-blue-800 text-sm">
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
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 bg-blue-700 hover:bg-blue-800 text-sm">
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

export default function ConfiguracionPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-5">Configuración</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelSecuencia />
        <PanelSecuenciaOC />
      </div>
    </div>
  )
}
