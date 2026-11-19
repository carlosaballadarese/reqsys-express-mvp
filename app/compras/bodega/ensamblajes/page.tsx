'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Orden = { id: string; numero: string; estado: string; created_at: string; confirmado_en: string | null }

const ESTADO_LABEL: Record<string, string> = { generada: 'Generada', confirmada: 'Confirmada' }
const ESTADO_COLOR: Record<string, string> = {
  generada: 'bg-amber-100 text-amber-800',
  confirmada: 'bg-green-100 text-green-800',
}

// Spec: HU-031 CA-01/CA-05 — listado de Órdenes de Ensamblaje (Field Build).
export default function EnsamblajesPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/compras/bodega/ensamblajes')
      .then((r) => r.json())
      .then((data) => { setOrdenes(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [])

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Órdenes de Ensamblaje (Field Build)</CardTitle>
          <Link href="/compras/bodega/ensamblajes/nuevo"><Button size="sm">+ Nueva Orden</Button></Link>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : ordenes.length === 0 ? (
            <p className="text-sm text-gray-500">No hay órdenes de ensamblaje.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">N° Orden</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Creada</th>
                  <th className="p-2">Confirmada</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id} className="border-b hover:bg-gray-50">
                    <td className="p-2"><Link href={`/compras/bodega/ensamblajes/${o.id}`} className="text-teal-700 hover:underline">{o.numero}</Link></td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[o.estado] ?? ''}`}>{ESTADO_LABEL[o.estado] ?? o.estado}</span></td>
                    <td className="p-2">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="p-2">{o.confirmado_en ? new Date(o.confirmado_en).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
