'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Estado = 'pendiente' | 'procesado' | 'error'

export default function DevolverPage() {
  const params = useParams()
  const token = params.token as string

  const [estado, setEstado] = useState<Estado>('pendiente')
  const [motivo, setMotivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleDevolver() {
    if (!motivo.trim()) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/devolver/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo_devolucion: motivo }),
      })
      const data = await res.json()
      if (data.success) {
        setEstado('procesado')
      } else {
        setEstado('error')
        setMensaje(data.error || 'Error al procesar la devolución.')
      }
    } catch {
      setEstado('error')
      setMensaje('Error de conexión.')
    } finally {
      setEnviando(false)
    }
  }

  if (estado === 'procesado') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="text-5xl mb-4">↩</div>
            <h2 className="text-xl font-semibold mb-2">NP Devuelta</h2>
            <p className="text-slate-500">El solicitante fue notificado con las instrucciones de corrección.</p>
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
          <CardTitle className="text-center">Devolver NP al Solicitante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
            El solicitante recibirá un correo con tu explicación y un enlace para corregir su pedido.
          </div>
          <div>
            <Label htmlFor="motivo">Motivo de devolución <span className="text-red-500">*</span></Label>
            <Textarea
              id="motivo"
              placeholder="Explica qué debe corregir el solicitante..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 min-h-[120px]"
            />
          </div>
          <Button
            onClick={handleDevolver}
            disabled={enviando || !motivo.trim()}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            {enviando ? 'Procesando...' : '↩ Devolver al solicitante'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
