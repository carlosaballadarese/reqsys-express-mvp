'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Guia = {
  id: string; numero: number; serie: string; estado: string; documento_egreso_id: string
  fecha_inicio_traslado: string; motivo: string; destinatario_nombre: string
  transportista_nombre: string; placa: string
}

const numGuia = (n: number) => String(n).padStart(7, '0')
const MOTIVO_LABEL: Record<string, string> = {
  venta: 'Venta', renta: 'Renta', devolucion: 'Devolución', consignacion: 'Consignación', otros: 'Otros',
}
const FILTROS_VACIOS = { numero: '', desde: '', hasta: '', destinatario: '', transportista: '', estado: '' }

// Spec: HU-042 CA-18 — listado de guías de remisión con filtros.
export default function GuiasPage() {
  const [guias, setGuias] = useState<Guia[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)

  function cargar(f = filtros) {
    setCargando(true)
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v.trim()) q.set(k, v.trim())
    fetch(`/api/compras/bodega/guias?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => { setGuias(Array.isArray(d) ? d : []); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  const set = (k: keyof typeof FILTROS_VACIOS, v: string) => setFiltros((f) => ({ ...f, [k]: v }))

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Guías de Remisión</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Se emiten desde un Documento de Egreso (al cerrarlo, o después desde su detalle).
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
            <div><Label className="text-xs">N° de guía</Label><Input value={filtros.numero} onChange={(e) => set('numero', e.target.value)} className="mt-1 h-8 text-sm" placeholder="1822" /></div>
            <div><Label className="text-xs">Desde</Label><Input type="date" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">Hasta</Label><Input type="date" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">Destinatario</Label><Input value={filtros.destinatario} onChange={(e) => set('destinatario', e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">Transportista</Label><Input value={filtros.transportista} onChange={(e) => set('transportista', e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div>
              <Label className="text-xs">Estado</Label>
              <select value={filtros.estado} onChange={(e) => set('estado', e.target.value)} className="border rounded px-2 py-1 text-sm w-full h-8 mt-1">
                <option value="">Todos</option><option value="emitida">Emitida</option><option value="anulada">Anulada</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => cargar()} className="btn-primary">Buscar</Button>
            <Button size="sm" variant="outline" onClick={() => { setFiltros(FILTROS_VACIOS); cargar(FILTROS_VACIOS) }}>Limpiar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{cargando ? 'Cargando...' : `${guias.length} guías`}</CardTitle></CardHeader>
        <CardContent>
          {!cargando && guias.length === 0 ? (
            <div className="text-center py-10 text-slate-400">No hay guías con esos filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-xs uppercase text-left">
                    <th className="py-2 pr-4">N°</th><th className="pr-4">Fecha</th><th className="pr-4">Motivo</th>
                    <th className="pr-4">Destinatario</th><th className="pr-4">Transportista</th><th className="pr-4">Placa</th><th className="pr-4">Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {guias.map((g) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono"><Link href={`/compras/bodega/guias/${g.id}`} className="text-blue-600 hover:underline">{numGuia(g.numero)}</Link></td>
                      <td className="pr-4">{g.fecha_inicio_traslado}</td>
                      <td className="pr-4">{MOTIVO_LABEL[g.motivo] ?? g.motivo}</td>
                      <td className="pr-4">{g.destinatario_nombre}</td>
                      <td className="pr-4">{g.transportista_nombre}</td>
                      <td className="pr-4 font-mono">{g.placa}</td>
                      <td className="pr-4">{g.estado === 'anulada' ? <span className="text-red-600">Anulada</span> : 'Emitida'}</td>
                      <td><a href={`/api/compras/bodega/guias/${g.id}/pdf`} className="text-xs text-blue-600 hover:underline">⬇ PDF</a></td>
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
