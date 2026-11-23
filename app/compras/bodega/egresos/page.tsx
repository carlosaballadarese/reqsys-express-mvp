'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type DocumentoEgreso = {
  id: string
  numero: string
  tipo: string
  estado: string
  override_admin: boolean
  created_at: string
  cerrado_en: string | null
}

const TIPO_LABEL: Record<string, string> = {
  venta: 'Venta', gasto: 'Gasto', prestamo: 'Préstamo', reconteo: 'Reconteo',
}
const TIPO_COLOR: Record<string, string> = {
  venta: 'bg-green-100 text-green-800',
  gasto: 'bg-orange-100 text-orange-800',
  prestamo: 'bg-blue-100 text-blue-800',
  reconteo: 'bg-purple-100 text-purple-800',
}
const ESTADO_LABEL: Record<string, string> = {
  generado: 'Generado', en_validacion: 'En Validación', cerrado: 'Cerrado',
}
const ESTADO_COLOR: Record<string, string> = {
  generado: 'bg-amber-100 text-amber-800',
  en_validacion: 'bg-blue-100 text-blue-800',
  cerrado: 'bg-green-100 text-green-800',
}

// Spec: HU-030 CA-01/CA-04 — listado de Documentos de Egreso.
export default function EgresosPage() {
  const [documentos, setDocumentos] = useState<DocumentoEgreso[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    setCargando(true)
    const qs = filtroTipo ? `?tipo=${filtroTipo}` : ''
    fetch(`/api/compras/bodega/egresos${qs}`)
      .then((r) => r.json())
      .then((data) => { setDocumentos(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }, [filtroTipo])

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Documentos de Egreso de Bodega</CardTitle>
          <div className="flex items-center gap-3">
            <select className="border rounded px-2 py-1 text-sm" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Link href="/compras/bodega/egresos/prestamos-pendientes">
              <Button size="sm" variant="outline">Préstamos Pendientes</Button>
            </Link>
            <Link href="/compras/bodega/egresos/nuevo">
              <Button size="sm">+ Nuevo Egreso</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : documentos.length === 0 ? (
            <p className="text-sm text-gray-500">No hay documentos de egreso.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">N° Egreso</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Creado</th>
                    <th className="p-2">Cerrado</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <Link href={`/compras/bodega/egresos/${d.id}`} className="text-teal-700 hover:underline">
                          {d.numero}
                        </Link>
                        {d.override_admin && <span className="ml-2 text-xs text-red-600" title="Cerrado con override de saldo">⚠ override</span>}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLOR[d.tipo] ?? ''}`}>{TIPO_LABEL[d.tipo] ?? d.tipo}</span>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLOR[d.estado] ?? ''}`}>{ESTADO_LABEL[d.estado] ?? d.estado}</span>
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
