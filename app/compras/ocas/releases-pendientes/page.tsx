'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type ReleasePendiente = {
  id: string; numero_release: string; oca_id: string; area_id: string
  monto_total: number; observaciones: string | null; created_at: string
  numero_oca: string | null; area_nombre: string | null; solicitante_nombre: string | null
  // Spec: HU-024 CA-03
  alerta_antiguedad: boolean
}

function usd(n: number) {
  return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ReleasesPendientesPage() {
  const [releases, setReleases] = useState<ReleasePendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  // Spec: HU-021 CA-05 — filtros opcionales de la bandeja
  const [filtroOcaId, setFiltroOcaId] = useState('')
  const [filtroAreaId, setFiltroAreaId] = useState('')

  const [modalResolver, setModalResolver] = useState<{ release: ReleasePendiente; decision: 'aprobar' | 'rechazar' } | null>(null)
  const [motivoResolver, setMotivoResolver] = useState('')
  const [resolviendo, setResolviendo] = useState(false)

  function cargar() {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroOcaId) params.set('oca_id', filtroOcaId)
    if (filtroAreaId) params.set('area_id', filtroAreaId)
    fetch(`/api/compras/ocas/releases/pendientes?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setReleases(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [filtroOcaId, filtroAreaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolver() {
    if (!modalResolver) return
    if (modalResolver.decision === 'rechazar' && !motivoResolver.trim()) return
    setResolviendo(true); setError('')
    const res = await fetch(`/api/compras/ocas/${modalResolver.release.oca_id}/releases/${modalResolver.release.id}/resolver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: modalResolver.decision, motivo: motivoResolver }),
    })
    const data = await res.json()
    setResolviendo(false)
    if (res.ok) { setModalResolver(null); setMotivoResolver(''); cargar() }
    else { setError(data.error || 'Error al resolver el release') }
  }

  const ocasUnicas = [...new Map(releases.map(r => [r.oca_id, r.numero_oca])).entries()]
  const areasUnicas = [...new Map(releases.map(r => [r.area_id, r.area_nombre])).entries()]

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-800">Releases pendientes de aprobación</h1>
          <p className="text-slate-500 text-sm mt-0.5">Releases de todas las OCAs que te corresponde aprobar</p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <Card>
          <CardContent className="flex flex-wrap gap-4 pt-4">
            <div>
              <Label className="text-xs">OCA</Label>
              <select value={filtroOcaId} onChange={e => setFiltroOcaId(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todas</option>
                {ocasUnicas.map(([id, numero]) => <option key={id} value={id}>{numero}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Centro de costo</Label>
              <select value={filtroAreaId} onChange={e => setFiltroAreaId(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm mt-1">
                <option value="">Todos</option>
                {areasUnicas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {cargando ? (
              <p className="text-slate-400 text-sm">Cargando...</p>
            ) : releases.length === 0 ? (
              <p className="text-slate-400 text-sm">No hay releases pendientes de aprobación.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-2 pr-4">Release</th>
                      <th className="text-left py-2 pr-4">OCA</th>
                      <th className="text-left py-2 pr-4">Centro de costo</th>
                      <th className="text-left py-2 pr-4">Solicitante</th>
                      <th className="text-right py-2 pr-4">Monto</th>
                      <th className="text-left py-2 pr-4">Generado</th>
                      <th className="text-right py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{r.numero_release}</td>
                        <td className="py-2 pr-4">
                          <Link href={`/compras/ocas/${r.oca_id}`} className="text-teal-700 hover:underline">
                            {r.numero_oca ?? r.oca_id}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{r.area_nombre ?? '—'}</td>
                        <td className="py-2 pr-4">{r.solicitante_nombre ?? '—'}</td>
                        <td className="py-2 pr-4 text-right">{usd(r.monto_total)}</td>
                        <td className="py-2 pr-4">
                          {new Date(r.created_at).toLocaleDateString('es-EC')}
                          {r.alerta_antiguedad && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              &gt; 24h
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button className="btn-primary text-xs h-7" onClick={() => setModalResolver({ release: r, decision: 'aprobar' })}>
                              ✓ Aprobar
                            </Button>
                            <Button variant="outline" className="text-xs h-7 text-red-600" onClick={() => setModalResolver({ release: r, decision: 'rechazar' })}>
                              ✕ Rechazar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {modalResolver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {modalResolver.decision === 'aprobar' ? 'Aprobar release' : 'Rechazar release'}
            </h3>
            <p className="text-slate-500 text-sm mb-3">
              {modalResolver.release.numero_release} — {usd(modalResolver.release.monto_total)}
            </p>
            {modalResolver.decision === 'rechazar' && (
              <>
                <Label className="text-xs">Motivo *</Label>
                <textarea value={motivoResolver} onChange={e => setMotivoResolver(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mt-1" rows={3} />
              </>
            )}
            <div className="flex gap-3 mt-4">
              <Button
                className="btn-primary text-sm"
                disabled={resolviendo || (modalResolver.decision === 'rechazar' && !motivoResolver.trim())}
                onClick={handleResolver}
              >
                {resolviendo ? 'Procesando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" className="text-sm" onClick={() => { setModalResolver(null); setMotivoResolver('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
