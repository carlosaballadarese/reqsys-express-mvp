'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { Rol } from '@/lib/nav-config'
import { vistasOrdenesVisibles, EN_APROBACION } from '@/lib/vistas-ordenes'

type OC = {
  id: string
  numero_oc: string
  numero_np: string | null
  proveedor: string
  area: string | null
  tipo_compra: string | null
  valor_total: number
  valor_a_pagar: number
  estado_oc: string
  fecha_oc: string | null
  created_at: string
}

const ESTADO_BADGE: Record<string, string> = {
  en_proceso:               'bg-yellow-100 text-yellow-800',
  en_aprobacion_gerencia:   'bg-purple-100 text-purple-800',
  en_aprobacion_compras:    'bg-blue-100 text-blue-800',
  rechazada:                'bg-red-100 text-red-800',
  aprobada:                 'bg-green-100 text-green-800',
  cancelada:                'bg-slate-100 text-slate-600',
}

const ESTADO_LABEL: Record<string, string> = {
  en_proceso:               'En Proceso',
  en_aprobacion_gerencia:   'Aprobación Gerencia',
  en_aprobacion_compras:    'Aprobación Compras',
  rechazada:                'Rechazada',
  aprobada:                 'Aprobada',
  cancelada:                'Cancelada',
  // Spec: SC-011-v2.md Decisión de diseño 2 — valor centinela de frontend,
  // nunca enviado al backend (ver cargar()); solo para que el <select> del
  // panel Filtros refleje la vista "En aprobación" cuando está activa.
  en_aprobacion:            'En aprobación (Compras + Gerencia)',
}

const ESTADOS = [
  'todos', 'en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras',
  'rechazada', 'aprobada', 'cancelada', 'en_aprobacion',
]

// Spec: SC-011-v2.md CA-01/CA-06 — panel "Vistas", compartido entre el aside
// de desktop y el overlay de mobile (mismo contenido, distinto contenedor),
// mismo patrón que app/compras/page.tsx (SC-009).
function renderVistas(rol: Rol, ocsBase: OC[], searchParams: URLSearchParams, onNavegar?: () => void) {
  return (
    <nav className="space-y-1">
      {vistasOrdenesVisibles({ rol }).map(v => {
        const activa = v.esActiva(searchParams)
        return (
          <Link
            key={v.label}
            href={v.construirHref()}
            onClick={onNavegar}
            className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              activa ? 'bg-[#1a5252]/10 text-[#1a5252] font-semibold' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{v.label}</span>
            <span className={`text-xs rounded-full px-2 py-0.5 ${activa ? 'bg-[#1a5252] text-white' : 'bg-slate-100 text-slate-500'}`}>
              {v.contar(ocsBase)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function OrdenesPage() {
  // Spec: SC-008-v3.md — "Vista guardada" OCs en aprobación de gerencia
  // llega con ?estado= en la URL; se usa como valor inicial sin cambiar el
  // comportamiento por defecto (sin query string, arranca en 'todos' igual que hoy).
  const searchParams = useSearchParams()
  const [ocs, setOcs]           = useState<OC[]>([])
  const [ocsBase, setOcsBase]   = useState<OC[]>([])
  const [filtrosAbiertos, setFiltrosAbiertos]           = useState(false)
  const [vistasMobileAbiertas, setVistasMobileAbiertas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [q, setQ]               = useState('')
  const [estado, setEstado]     = useState(() => searchParams.get('estado') ?? 'todos')
  const [area, setArea]         = useState('todas')
  const [areas, setAreas]       = useState<{ id: string; nombre: string }[]>([])
  const [rol, setRol]           = useState('')

  useEffect(() => {
    fetch('/api/compras/areas').then(r => r.json()).then(setAreas).catch(console.error)

    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch('/api/auth/perfil').then(r => r.json()).then(p => setRol(p.rol ?? '')).catch(console.error)
    })
  }, [])

  const cargar = useCallback(() => {
    setCargando(true)

    const paramsBase = () => {
      const p = new URLSearchParams()
      if (area !== 'todas') p.set('area', area)
      if (q.trim())         p.set('q', q.trim())
      return p
    }

    // Spec: SC-011-v2.md RN-02/RN-06 — "En aprobación" agrupa 2 valores
    // reales de estado_oc que el backend no soporta combinar en una sola
    // llamada (filtra por un único valor exacto). Se resuelve con 2
    // llamadas al mismo endpoint ya existente, mezcladas y reordenadas por
    // created_at descendente — sin agregar ninguna capacidad nueva de backend.
    if (estado === 'en_aprobacion') {
      const pCompras  = paramsBase(); pCompras.set('estado', EN_APROBACION[0])
      const pGerencia = paramsBase(); pGerencia.set('estado', EN_APROBACION[1])

      Promise.all([
        fetch(`/api/compras/ordenes?${pCompras}`).then(r => r.json()),
        fetch(`/api/compras/ordenes?${pGerencia}`).then(r => r.json()),
      ])
        .then(([a, b]) => {
          const combinadas = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
            .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
          setOcs(combinadas)
          setCargando(false)
        })
        .catch(() => setCargando(false))
      return
    }

    const params = paramsBase()
    if (estado !== 'todos') params.set('estado', estado)

    fetch(`/api/compras/ordenes?${params}`)
      .then(r => r.json())
      .then(data => { setOcs(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [estado, area, q])

  useEffect(() => { cargar() }, [cargar])

  // Spec: SC-011-v2.md CA-08 — un clic en "Vistas" estando ya parado en esta
  // misma pantalla (self-link) no remonta el componente en Next.js App
  // Router, solo cambia el query string: sin este efecto, `estado` quedaría
  // congelado en el valor leído al montar y la vista clickeada no se
  // aplicaría ni se resaltaría. Mismo patrón ya resuelto por SC-009.
  useEffect(() => {
    setEstado(searchParams.get('estado') ?? 'todos')
  }, [searchParams])

  // Spec: SC-011-v2.md RN-02 — baseline sin filtro, solo para los contadores
  // del panel "Vistas"; no sustituye a `cargar()` (que sigue aplicando los
  // filtros activos, incluida la mezcla de "En aprobación", a la tabla).
  useEffect(() => {
    fetch('/api/compras/ordenes')
      .then(r => r.json())
      .then(data => setOcsBase(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Órdenes de Compra</h1>
          </div>
          <div className="flex gap-2">
            <a href="/api/exportar/ocs" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Excel</Button>
            </a>
            <Link href="/compras/ordenes/nueva">
              <Button className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">+ Nueva OC</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Vistas — acceso rápido */}
          {rol && (
            <>
              <button
                onClick={() => setVistasMobileAbiertas(true)}
                className="lg:hidden flex items-center gap-2 text-sm font-medium text-slate-600 px-3 py-2 rounded-md border border-slate-200 bg-white w-fit"
              >
                ☰ Vistas
              </button>

              {vistasMobileAbiertas && (
                <div
                  className="lg:hidden fixed inset-0 z-[90] bg-black/40"
                  onClick={() => setVistasMobileAbiertas(false)}
                >
                  <aside
                    onClick={e => e.stopPropagation()}
                    className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl overflow-y-auto p-3"
                  >
                    {renderVistas(rol as Rol, ocsBase, searchParams, () => setVistasMobileAbiertas(false))}
                  </aside>
                </div>
              )}

              <aside className="hidden lg:block lg:w-56 shrink-0">
                <Card>
                  <CardContent className="p-2">
                    {renderVistas(rol as Rol, ocsBase, searchParams)}
                  </CardContent>
                </Card>
              </aside>
            </>
          )}

          {/* Columna central */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar número OC, NP o proveedor..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm flex-1"
              />
              <Button onClick={cargar} className="h-9 btn-primary shrink-0">Buscar</Button>
              <Button
                variant="outline"
                onClick={() => setFiltrosAbiertos(o => !o)}
                className="h-9 text-sm shrink-0"
              >
                Filtros {filtrosAbiertos ? '▲' : '▼'}
              </Button>
            </div>

            {filtrosAbiertos && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={estado}
                      onChange={e => setEstado(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {ESTADOS.map(e => (
                        <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : ESTADO_LABEL[e] ?? e}</option>
                      ))}
                    </select>
                    <select
                      value={area}
                      onChange={e => setArea(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="todas">Todas las áreas</option>
                      {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                    </select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabla */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">
                  {cargando ? 'Cargando...' : `${ocs.length} órdenes`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cargando ? (
                  <div className="text-center py-12 text-slate-400">Cargando...</div>
                ) : ocs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">No hay órdenes con los filtros aplicados.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-slate-500 text-xs uppercase">
                          <th className="text-left py-3 pr-4">Número OC</th>
                          <th className="text-left py-3 pr-4">NP Origen</th>
                          <th className="text-left py-3 pr-4">Proveedor</th>
                          <th className="text-left py-3 pr-4">Área</th>
                          <th className="text-right py-3 pr-4">Total</th>
                          <th className="text-right py-3 pr-4">A Pagar</th>
                          <th className="text-left py-3 pr-4">Estado</th>
                          <th className="text-left py-3">Fecha OC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocs.map(oc => (
                          <tr key={oc.id} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="py-3 pr-4">
                              <Link href={`/compras/ordenes/${oc.id}`} className="font-mono font-medium text-blue-700 hover:underline">
                                {oc.numero_oc}
                              </Link>
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                              {oc.numero_np
                                ? <span className="text-slate-600">{oc.numero_np}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="py-3 pr-4 font-medium">{oc.proveedor}</td>
                            <td className="py-3 pr-4 text-slate-500 text-xs">{oc.area ?? '—'}</td>
                            <td className="py-3 pr-4 text-right font-medium">${Number(oc.valor_total).toFixed(2)}</td>
                            <td className="py-3 pr-4 text-right text-blue-700 font-medium">${Number(oc.valor_a_pagar).toFixed(2)}</td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[oc.estado_oc] ?? 'bg-slate-100 text-slate-600'}`}>
                                {ESTADO_LABEL[oc.estado_oc] ?? oc.estado_oc}
                              </span>
                            </td>
                            <td className="py-3 text-slate-500 text-xs">
                              {oc.fecha_oc
                                ? new Date(oc.fecha_oc).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
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
      </div>
    </div>
  )
}
