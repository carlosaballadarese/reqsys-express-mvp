'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type NP = {
  id: string
  numero: string
  solicitante_nombre: string
  area: string
  prioridad: string
  estado: string
  total_estimado: number
  created_at: string
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  devuelta: 'bg-amber-100 text-amber-800',
}

const PRIORIDAD_BADGE: Record<string, string> = {
  excepcional: 'bg-red-100 text-red-800',
  alta: 'bg-orange-100 text-orange-800',
  media: 'bg-blue-100 text-blue-800',
  baja: 'bg-slate-100 text-slate-600',
}

export default function ListaNPs() {
  const [nps, setNps] = useState<NP[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/nps')
      .then((r) => r.json())
      .then((data) => {
        setNps(data)
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [])

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">
              {cargando ? 'Cargando...' : `${nps.length} registros`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : nps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No hay notas de pedido registradas.
                <br />
                <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
                  Crear la primera NP
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Número</th>
                      <th className="text-left py-3 pr-4">Solicitante</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-left py-3 pr-4">Prioridad</th>
                      <th className="text-right py-3 pr-4">Total Est.</th>
                      <th className="text-left py-3 pr-4">Estado</th>
                      <th className="text-left py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nps.map((np) => (
                      <tr key={np.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-mono font-medium text-blue-700">{np.numero}</td>
                        <td className="py-3 pr-4">{np.solicitante_nombre}</td>
                        <td className="py-3 pr-4 text-slate-600">{np.area}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORIDAD_BADGE[np.prioridad] ?? ''}`}>
                            {np.prioridad}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right font-medium">
                          ${Number(np.total_estimado).toFixed(2)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_BADGE[np.estado] ?? ''}`}>
                            {np.estado}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">
                          {new Date(np.created_at).toLocaleDateString('es-VE', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
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
