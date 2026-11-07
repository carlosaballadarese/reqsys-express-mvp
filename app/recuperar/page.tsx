'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const MENSAJE_GENERICO = 'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación en breve. Si no lo ves en tu bandeja de entrada, revisa también la carpeta de spam o correo no deseado.'

// Spec: SC-006 CA-03 — enlace usado/expirado: error claro + opción de reintentar
const ERROR_MSG: Record<string, string> = {
  enlace_invalido: 'El enlace no es válido o ya venció. Solicita uno nuevo a continuación.',
}

function RecuperarForm() {
  const errorParam = useSearchParams().get('error')

  const [email, setEmail]       = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje]   = useState('')
  const [error, setError]       = useState(errorParam ? ERROR_MSG[errorParam] ?? '' : '')
  const [enviado, setEnviado]   = useState(false)

  // Spec: SC-006 CA-01 — siempre muestra el mensaje genérico, exista o no la cuenta
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError('')
    setMensaje('')

    const res  = await fetch('/api/auth/recuperar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()

    setCargando(false)
    if (!res.ok) {
      setError(data.error ?? 'Ingresa un correo válido.')
      return
    }
    setMensaje(data.mensaje ?? MENSAJE_GENERICO)
    setEnviado(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-8 py-12">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/logo-reqsys.png" alt="REQSYS" width={80} height={80} />
          <div className="text-center">
            <h1 className="text-2xl font-black text-slate-800">
              REQ<span className="text-amber-600">SYS</span>
            </h1>
            <p className="text-xs text-slate-400 tracking-wide">Sistema de Gestión de Compras</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Recuperar contraseña</h2>
          <p className="text-slate-400 text-sm mt-1">
            Ingresa tu correo y te enviaremos un enlace para restablecerla.
          </p>
        </div>

        {enviado ? (
          <div className="flex items-start gap-2 text-teal-800 text-sm bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
            <span className="shrink-0 mt-0.5">✓</span>
            <span>{mensaje}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
                Correo electrónico
              </Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mt-1.5 h-11 text-sm border-slate-200 focus:border-teal-600 focus:ring-teal-600"
                placeholder="usuario@correo.com"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-700 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={cargando}
              className="w-full h-11 font-semibold text-sm text-white transition-all"
              style={{
                background: cargando
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #1a5252 0%, #0f3535 100%)',
              }}
            >
              {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </Button>
          </form>
        )}

        <p className="text-center text-xs mt-8">
          <a href="/login" className="font-medium text-teal-700 hover:underline">
            Volver a iniciar sesión
          </a>
        </p>
      </div>
    </div>
  )
}

export default function RecuperarPage() {
  return (
    <Suspense>
      <RecuperarForm />
    </Suspense>
  )
}
