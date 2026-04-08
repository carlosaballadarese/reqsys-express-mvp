'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type NP = {
  id: string
  numero: string
  solicitante_nombre: string
  solicitante_email: string
  area: string
  prioridad: string
  tipo_compra: string
  estado: string
  total_estimado: number
  convertida: boolean
  created_at: string
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  aprobada:   'bg-green-100 text-green-800',
  rechazada:  'bg-red-100 text-red-800',
  devuelta:   'bg-amber-100 text-amber-800',
  convertida: 'bg-blue-100 text-blue-800',
}

const PRIORIDAD_BADGE: Record<string, string> = {
  excepcional: 'bg-red-100 text-red-800',
  alta:        'bg-orange-100 text-orange-800',
  media:       'bg-blue-100 text-blue-800',
  baja:        'bg-slate-100 text-slate-600',
}

const AREAS = [
  'Operaciones - Bombeo Mecánico',
  'Operaciones - Servicio Eléctrico',
  'Operaciones - Niveles',
  'Compras', 'QHSE', 'TTHH', 'Finanzas', 'Gerencia', 'Ventas',
]

const ESTADOS = ['todos', 'pendiente', 'aprobada', 'rechazada', 'devuelta']

export default function ComprasPage() {
  const [nps, setNps]           = useState<NP[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ]               = useState('')
  const [estado, setEstado]     = useState('todos')
  const [area, setArea]         = useState('todas')
  const [esSolicitante, setEsSolicitante] = useState(false)
  const [puedeCrearNP, setPuedeCrearNP]   = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch('/api/auth/perfil')
        .then(r => r.json())
        .then(p => {
          if (p.rol === 'solicitante') setEsSolicitante(true)
          if (['solicitante', 'compras', 'admin', 'gerencia'].includes(p.rol)) setPuedeCrearNP(true)
        })
    })
  }, [])

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (estado !== 'todos') params.set('estado', estado)
    if (area   !== 'todas') params.set('area', area)
    if (q.trim())           params.set('q', q.trim())

    fetch(`/api/compras/nps?${params}`)
      .then(r => r.json())
      .then(data => { setNps(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [estado, area, q])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="page-header px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{esSolicitante ? 'Mis Notas de Pedido' : 'Notas de Pedido'}</h1>
            <p className="text-blue-300 text-xs mt-0.5">Listado y gestión de requerimientos</p>
          </div>
          <div className="flex gap-2">
            <a href="/api/exportar/nps" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Excel</Button>
            </a>
            {puedeCrearNP && (
              <Link href="/compras/nueva">
                <Button className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">+ Nueva NP</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Buscar número o solicitante..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
              <select
                value={area}
                onChange={e => setArea(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas las áreas</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <Button onClick={cargar} className="h-9 btn-primary">
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${nps.length} registros`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : nps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay registros con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Número</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-left py-3 pr-4">Tipo</th>
                      <th className="text-right py-3 pr-4">Total Est.</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3 pr-4">OC</th>
                      <th className="text-left py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nps.map(np => (
                      <tr key={np.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          <Link href={`/compras/${np.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                            {np.numero}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{np.solicitante_nombre}</div>
                          <div className="text-xs text-slate-400">{np.solicitante_email}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">{np.area}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORIDAD_BADGE[np.prioridad] ?? ''}`}>
                            {np.prioridad}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600 text-xs capitalize">{np.tipo_compra}</td>
                        <td className="py-3 pr-4 text-right font-medium">${Number(np.total_estimado).toFixed(2)}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_BADGE[np.estado] ?? ''}`}>
                            {np.estado}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {np.convertida
                            ? <span className="text-xs text-blue-600 font-medium">✓ Convertida</span>
                            : <span className="text-xs text-slate-400">—</span>
                          }
                        </td>
                        <td className="py-3 text-slate-500 text-xs">
                          {new Date(np.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
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
    </div>
  )
}
