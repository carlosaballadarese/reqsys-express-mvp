'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Prestamo = { id: string; numero: string; bodega_id: string; cerrado_en: string | null }

// Spec: HU-030 CA-05 — Préstamos cerrados sin Devolución cerrada que los referencie.
export default function PrestamosPendientesPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/compras/bodega/egresos/prestamos-pendientes')
      .then((r) => r.json())
      .then((data) => { setPrestamos(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [])

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Préstamos Pendientes de Devolución</CardTitle></CardHeader>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : prestamos.length === 0 ? (
            <p className="text-sm text-gray-500">No hay préstamos pendientes de devolución.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">N° Egreso</th>
                  <th className="p-2">Fecha de cierre</th>
                </tr>
              </thead>
              <tbody>
                {prestamos.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <Link href={`/compras/bodega/egresos/${p.id}`} className="text-teal-700 hover:underline">{p.numero}</Link>
                    </td>
                    <td className="p-2">{p.cerrado_en ? new Date(p.cerrado_en).toLocaleDateString() : '—'}</td>
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
