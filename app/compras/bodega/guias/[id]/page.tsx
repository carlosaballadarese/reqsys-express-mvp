'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'

type Item = { id: string; linea: number; codigo: string; descripcion: string; unidad: string; cantidad: number }
type Guia = {
  id: string; numero: number; serie: string; estado: string
  fecha_inicio_traslado: string; fecha_fin_traslado: string; punto_partida: string; punto_llegada: string
  motivo: string; motivo_otros: string | null; numero_referencia: string | null; comentarios: string | null
  destinatario_nombre: string; destinatario_ruc: string | null
  transportista_nombre: string; transportista_identificacion: string; placa: string
  despachado_por_nombre: string; motivo_anulacion: string | null
  items: Item[]; egreso: { id: string; numero: string; tipo: string } | null
}

const numGuia = (n: number) => String(n).padStart(7, '0')
const MOTIVO_LABEL: Record<string, string> = {
  venta: 'Venta', renta: 'Renta', devolucion: 'Devolución', consignacion: 'Consignación', otros: 'Otros',
}

// Spec: HU-042 CA-14/CA-16/CA-17/CA-18 — detalle, PDF y anulación (compras/admin).
export default function DetalleGuiaPage() {
  const { id } = useParams<{ id: string }>()
  const [guia, setGuia] = useState<Guia | null>(null)
  const [rol, setRol] = useState('')
  const [cargando, setCargando] = useState(true)
  const [anulando, setAnulando] = useState(false)
  const [mostrarAnular, setMostrarAnular] = useState(false)
  const [motivo, setMotivo] = useState('')

  function cargar() {
    setCargando(true)
    fetch(`/api/compras/bodega/guias/${id}`).then((r) => r.json())
      .then((d) => { setGuia(d?.error ? null : d); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { if (id) cargar() }, [id])
  useEffect(() => {
    fetch('/api/auth/perfil').then((r) => r.json()).then((p) => setRol(p?.rol ?? '')).catch(() => {})
  }, [])

  async function handleAnular() {
    setAnulando(true)
    try {
      const res = await fetch(`/api/compras/bodega/guias/${id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al anular'); return }
      toast.success('Guía anulada — sus cantidades vuelven a estar disponibles')
      setMostrarAnular(false); setMotivo(''); cargar()
    } finally { setAnulando(false) }
  }

  if (cargando) return <div className="p-6">Cargando...</div>
  if (!guia) return <div className="p-6">Guía no encontrada.</div>

  const puedeAnular = ['compras', 'admin'].includes(rol) && guia.estado === 'emitida'

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Guía de Remisión N° {numGuia(guia.numero)}
            {guia.estado === 'anulada' && <span className="ml-3 text-sm text-red-600">ANULADA</span>}
          </CardTitle>
          <div className="flex gap-2">
            <a href={`/api/compras/bodega/guias/${guia.id}/pdf`}><Button size="sm" variant="outline">⬇ PDF</Button></a>
            {puedeAnular && <Button size="sm" onClick={() => setMostrarAnular(true)} className="bg-red-700 hover:bg-red-800">Anular guía</Button>}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <p><strong>Serie:</strong> {guia.serie}</p>
          <p><strong>Egreso:</strong> {guia.egreso ? <Link className="text-blue-600 hover:underline" href={`/compras/bodega/egresos/${guia.egreso.id}`}>{guia.egreso.numero}</Link> : '—'}</p>
          <p><strong>Inicio del traslado:</strong> {guia.fecha_inicio_traslado}</p>
          <p><strong>Terminación:</strong> {guia.fecha_fin_traslado}</p>
          <p><strong>Punto de partida:</strong> {guia.punto_partida}</p>
          <p><strong>Punto de llegada:</strong> {guia.punto_llegada}</p>
          <p><strong>Motivo:</strong> {MOTIVO_LABEL[guia.motivo] ?? guia.motivo}{guia.motivo === 'otros' && guia.motivo_otros ? ` — ${guia.motivo_otros}` : ''}</p>
          <p><strong>N° de referencia:</strong> {guia.numero_referencia ?? '—'}</p>
          <p><strong>Destinatario:</strong> {guia.destinatario_nombre} {guia.destinatario_ruc ? `(${guia.destinatario_ruc})` : ''}</p>
          <p><strong>Transportista:</strong> {guia.transportista_nombre} ({guia.transportista_identificacion}) — {guia.placa}</p>
          <p><strong>Despachado por:</strong> {guia.despachado_por_nombre}</p>
          {guia.comentarios && <p className="sm:col-span-2"><strong>Comentarios:</strong> {guia.comentarios}</p>}
          {guia.estado === 'anulada' && <p className="sm:col-span-2 text-red-600"><strong>Motivo de anulación:</strong> {guia.motivo_anulacion}</p>}
        </CardContent>
      </Card>

      {mostrarAnular && (
        <Card className="border-red-300">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm text-red-700">La guía quedará anulada; su número no se reutiliza y las cantidades vuelven a estar disponibles para otra guía.</p>
            <Input placeholder="Motivo de la anulación (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAnular} disabled={anulando || !motivo.trim()} className="bg-red-700 hover:bg-red-800">{anulando ? 'Anulando...' : 'Confirmar anulación'}</Button>
              <Button size="sm" variant="outline" onClick={() => setMostrarAnular(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Ítems</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Línea</th><th className="p-2">N° Parte / Serie</th><th className="p-2">Descripción</th><th className="p-2">Unidad</th><th className="p-2">Cantidad</th></tr></thead>
            <tbody>
              {guia.items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="p-2">{it.linea}</td><td className="p-2 font-mono text-xs">{it.codigo}</td>
                  <td className="p-2">{it.descripcion}</td><td className="p-2">{it.unidad}</td><td className="p-2">{it.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
