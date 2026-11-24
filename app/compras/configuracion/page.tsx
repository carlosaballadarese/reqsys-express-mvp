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

// Spec: HU-043 CA-02/CA-03/CA-04/CA-06 — clon paramétrico de PanelSecuencia/
// PanelSecuenciaOC para los 3 contadores por año de Bodega (Ingreso/Egreso/
// Ensamblaje) — mismo shape de datos y comportamiento, sin tocar los 2
// paneles existentes de arriba.
function PanelSecuenciaPorAño({ titulo, endpoint, prefijo }: { titulo: string; endpoint: string; prefijo: string }) {
  const [secuencias, setSecuencias]       = useState<Secuencia[]>([])
  const [año, setAño]                     = useState(String(new Date().getFullYear()))
  const [numeroInicial, setNumeroInicial] = useState('1')
  const [guardando, setGuardando]         = useState(false)
  const [msg, setMsg]                     = useState('')

  function cargarSecuencias() {
    fetch(endpoint).then(r => r.json()).then(d => setSecuencias(Array.isArray(d) ? d : []))
  }

  useEffect(() => { cargarSecuencias() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGuardar() {
    setGuardando(true)
    setMsg('')
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ año: Number(año), numero_inicial: Number(numeroInicial) }),
    })
    const data = await res.json()
    if (data.success) {
      setMsg(`✓ Próximo ${prefijo} del ${año} será ${prefijo}-${año}-${String(data.proximo).padStart(4, '0')}`)
      cargarSecuencias()
    } else {
      setMsg(`Error: ${data.error}`)
    }
    setGuardando(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-700">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Año</Label>
            <Input type="number" value={año} onChange={e => setAño(e.target.value)} className="mt-1 h-8 text-sm" min={2024} max={2099} />
          </div>
          <div>
            <Label className="text-xs">Número inicial (próximo)</Label>
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
                    <td className="py-2 font-mono">{prefijo}-{s.año}-{String(s.ultimo_numero).padStart(4, '0')}</td>
                    <td className="py-2 font-mono text-blue-600">{prefijo}-{s.año}-{String(s.ultimo_numero + 1).padStart(4, '0')}</td>
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

// Spec: HU-043 CA-05/CA-07/CA-11 — distinto a PanelSecuenciaPorAño: sin
// selector de Año (guia_secuencia es un contador global continuo, nunca
// reiniciado) y muestra el error 400 que el backend devuelve si el número
// inicial no supera al actual (RN-04 — implicación legal ante el SRI).
function PanelSecuenciaGuia() {
  const [ultimoNumero, setUltimoNumero]   = useState<number | null>(null)
  const [numeroInicial, setNumeroInicial] = useState('1822')
  const [guardando, setGuardando]         = useState(false)
  const [msg, setMsg]                     = useState('')

  function cargarEstado() {
    fetch('/api/compras/bodega/secuencia-guia')
      .then(r => r.json())
      .then(d => setUltimoNumero(typeof d.ultimo_numero === 'number' ? d.ultimo_numero : null))
  }

  useEffect(() => { cargarEstado() }, [])

  async function handleGuardar() {
    setGuardando(true)
    setMsg('')
    const res = await fetch('/api/compras/bodega/secuencia-guia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero_inicial: Number(numeroInicial) }),
    })
    const data = await res.json()
    if (data.success) {
      setMsg(`✓ Próxima Guía será la N° ${String(data.proximo).padStart(7, '0')}`)
      cargarEstado()
    } else {
      setMsg(`Error: ${data.error}`)
    }
    setGuardando(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-700">Numeración de Guías de Remisión</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">
          Contador único y continuo (nunca se reinicia por año) — regulado por el SRI. La Serie
          y el tope autorizado se configuran en Datos de Empresa.
        </p>
        {ultimoNumero !== null && (
          <p className="text-sm text-slate-600">
            Número actual emitido: <span className="font-mono">{String(ultimoNumero).padStart(7, '0')}</span>
            {' · '}Próximo: <span className="font-mono text-blue-600">{String(ultimoNumero + 1).padStart(7, '0')}</span>
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <Label className="text-xs">Número inicial (próximo)</Label>
            <Input type="number" value={numeroInicial} onChange={e => setNumeroInicial(e.target.value)} className="mt-1 h-8 text-sm" min={1} />
          </div>
          <Button onClick={handleGuardar} disabled={guardando} className="h-8 btn-primary text-sm">
            {guardando ? 'Guardando...' : 'Establecer'}
          </Button>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
      </CardContent>
    </Card>
  )
}

export default function ConfiguracionPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">Numeraciones</h1>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Compras</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelSecuencia />
          <PanelSecuenciaOC />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Bodega</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelSecuenciaPorAño titulo="Numeración de Documentos de Ingreso" endpoint="/api/compras/bodega/secuencia-ingreso" prefijo="ING" />
          <PanelSecuenciaPorAño titulo="Numeración de Documentos de Egreso" endpoint="/api/compras/bodega/secuencia-egreso" prefijo="EGR" />
          <PanelSecuenciaPorAño titulo="Numeración de Órdenes de Ensamblaje" endpoint="/api/compras/bodega/secuencia-ensamblaje" prefijo="FB" />
          <PanelSecuenciaGuia />
        </div>
      </div>

      {/* Spec: HU-044 CA-01/CA-02 — /api/compras/secuencia-oca ya existía desde HU-018
          (espejo exacto de NP/OC), pero nunca estuvo conectado a ninguna pantalla. */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">OCA</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelSecuenciaPorAño titulo="Numeración de OCA" endpoint="/api/compras/secuencia-oca" prefijo="OCA" />
        </div>
      </div>
    </div>
  )
}
