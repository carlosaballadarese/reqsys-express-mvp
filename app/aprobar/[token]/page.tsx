'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Estado = 'cargando' | 'pendiente' | 'procesado' | 'error'

export default function AprobarPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const accionInicial = searchParams.get('accion') as 'aprobar' | 'rechazar' | null

  const [estado, setEstado] = useState<Estado>('cargando')
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | null>(accionInicial)
  const [motivo, setMotivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (token) setEstado('pendiente')
  }, [token])

  async function procesar() {
    if (accion === 'rechazar' && !motivo.trim()) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/aprobar/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, motivo_rechazo: motivo }),
      })
      const data = await res.json()
      if (data.success) {
        setEstado('procesado')
        setMensaje(accion === 'aprobar' ? 'La Nota de Pedido fue aprobada correctamente.' : 'La Nota de Pedido fue rechazada.')
      } else {
        setEstado('error')
        setMensaje(data.error || 'Error al procesar la solicitud.')
      }
    } catch {
      setEstado('error')
      setMensaje('Error de conexión.')
    } finally {
      setEnviando(false)
    }
  }

  if (estado === 'cargando') {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Cargando...</div>
  }

  if (estado === 'procesado') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className={`text-5xl mb-4`}>{accion === 'aprobar' ? '✅' : '❌'}</div>
            <h2 className="text-xl font-semibold mb-2">
              {accion === 'aprobar' ? 'NP Aprobada' : 'NP Rechazada'}
            </h2>
            <p className="text-slate-500">{mensaje}</p>
            <p className="text-sm text-slate-400 mt-4">El solicitante ha sido notificado por email.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (estado === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">No se pudo procesar</h2>
            <p className="text-slate-500">{mensaje}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Revisión de Nota de Pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!accion && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setAccion('aprobar')}
                className="bg-green-600 hover:bg-green-700 h-14 text-base"
              >
                ✓ Aprobar
              </Button>
              <Button
                onClick={() => setAccion('rechazar')}
                variant="destructive"
                className="h-14 text-base"
              >
                ✗ Rechazar
              </Button>
            </div>
          )}

          {accion === 'aprobar' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                <p className="text-green-800 font-medium">¿Confirmar aprobación?</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setAccion(null)}>Cancelar</Button>
                <Button onClick={procesar} disabled={enviando} className="bg-green-600 hover:bg-green-700">
                  {enviando ? 'Procesando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}

          {accion === 'rechazar' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="motivo">Motivo del rechazo <span className="text-red-500">*</span></Label>
                <Textarea
                  id="motivo"
                  placeholder="Explica el motivo del rechazo..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setAccion(null)}>Cancelar</Button>
                <Button
                  onClick={procesar}
                  disabled={enviando || !motivo.trim()}
                  variant="destructive"
                >
                  {enviando ? 'Procesando...' : 'Confirmar Rechazo'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
