'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Proveedor = {
  id: string
  nombre: string
  clasificacion: string | null
  categoria: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
  activo: boolean
}

const CLASIFICACION_BADGE: Record<string, string> = {
  'CRITICO':    'bg-red-100 text-red-700',
  'NO CRITICO': 'bg-green-100 text-green-700',
  'EVENTUAL':   'bg-slate-100 text-slate-600',
}

const CLASIFICACIONES = ['todas', 'CRITICO', 'NO CRITICO', 'EVENTUAL']

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando]       = useState(true)
  const [q, setQ]                     = useState('')
  const [clasificacion, setClasificacion] = useState('todas')
  const [soloActivos, setSoloActivos] = useState(true)

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (q.trim())                       params.set('q', q.trim())
    if (clasificacion !== 'todas')      params.set('clasificacion', clasificacion)
    if (!soloActivos)                   params.set('activo', 'false')

    fetch(`/api/proveedores?${params}`)
      .then(r => r.json())
      .then(data => { setProveedores(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [q, clasificacion, soloActivos])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-800 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">Proveedores</h1>
          <Link href="/compras/proveedores/nueva">
            <Button className="bg-white text-blue-800 hover:bg-blue-50 text-sm font-semibold">+ Nuevo Proveedor</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Input
                placeholder="Buscar nombre, categoría o contacto..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={clasificacion}
                onChange={e => setClasificacion(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CLASIFICACIONES.map(c => (
                  <option key={c} value={c}>{c === 'todas' ? 'Todas las clasificaciones' : c}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloActivos}
                  onChange={e => setSoloActivos(e.target.checked)}
                  className="rounded"
                />
                Solo activos
              </label>
              <Button onClick={cargar} className="h-9 bg-blue-700 hover:bg-blue-800">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${proveedores.length} proveedores`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : proveedores.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay proveedores con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 pr-4">Clasificación</th>
                      <th className="text-left py-3 pr-4">Categoría</th>
                      <th className="text-left py-3 pr-4">Ciudad</th>
                      <th className="text-left py-3 pr-4">Contacto</th>
                      <th className="text-left py-3 pr-4">Email</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedores.map(p => (
                      <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-medium">{p.nombre}</td>
                        <td className="py-3 pr-4">
                          {p.clasificacion ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CLASIFICACION_BADGE[p.clasificacion] ?? 'bg-slate-100 text-slate-600'}`}>
                              {p.clasificacion}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{p.categoria ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{p.ciudad ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">{p.contacto ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{p.email ?? '—'}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3">
                          <Link href={`/compras/proveedores/${p.id}`} className="text-xs text-blue-600 hover:underline">
                            Editar
                          </Link>
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
