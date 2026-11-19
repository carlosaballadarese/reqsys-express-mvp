'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DocumentoIngreso = {
  id: string
  numero: string
  estado: string
  registro_compras_id: string | null
  created_at: string
  cerrado_en: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  generado: 'Generado',
  en_validacion: 'En Validación',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}

const ESTADO_COLOR: Record<string, string> = {
  generado: 'bg-amber-100 text-amber-800',
  en_validacion: 'bg-blue-100 text-blue-800',
  cerrado: 'bg-green-100 text-green-800',
  anulado: 'bg-gray-200 text-gray-600',
}

// Spec: HU-028 CA-02/CA-03 — listado de Documentos de Ingreso.
export default function IngresosPage() {
  const [documentos, setDocumentos] = useState<DocumentoIngreso[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    setCargando(true)
    const qs = filtroEstado ? `?estado=${filtroEstado}` : ''
    fetch(`/api/compras/bodega/ingresos${qs}`)
      .then((r) => r.json())
      .then((data) => { setDocumentos(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [filtroEstado])

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Documentos de Ingreso de Bodega</CardTitle>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : documentos.length === 0 ? (
            <p className="text-sm text-gray-500">No hay documentos de ingreso.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">N° Ingreso</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Creado</th>
                    <th className="p-2">Cerrado</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <Link href={`/compras/bodega/ingresos/${d.id}`} className="text-teal-700 hover:underline">
                          {d.numero}
                        </Link>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[d.estado] ?? ''}`}>
                          {ESTADO_LABEL[d.estado] ?? d.estado}
                        </span>
                      </td>
                      <td className="p-2">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="p-2">{d.cerrado_en ? new Date(d.cerrado_en).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
