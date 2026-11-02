'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { validarPassword } from '@/lib/validators'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Estado = 'verificando' | 'valido' | 'invalido'

export default function ConfirmarRecuperacionPage() {
  const router = useRouter()

  const [estado, setEstado]           = useState<Estado>('verificando')
  const [password, setPassword]       = useState('')
  const [confirmar, setConfirmar]     = useState('')
  const [error, setError]             = useState('')
  const [cargando, setCargando]       = useState(false)
  const [exito, setExito]             = useState(false)

  // Spec: SC-006 CA-03 — link usado/expirado no deja sesión de recuperación activa.
  // generateLink({type:'recovery'}) de GoTrue entrega el token como hash de
  // implicit flow (#access_token=...&refresh_token=...), pero el cliente de
  // @supabase/ssr usa flowType 'pkce' por defecto y no detecta ese hash por sí
  // solo — la sesión se establece explícitamente con setSession().
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const params   = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    )

    // Supabase marca el error directamente en el hash cuando el link ya fue
    // usado o venció (en vez de access_token) — no hay sesión que establecer.
    if (params.get('error')) {
      setEstado('invalido')
      return
    }

    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: { session } }) => {
          if (session && typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname)
          }
          setEstado(session ? 'valido' : 'invalido')
        })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setEstado(session ? 'valido' : 'invalido')
    })
  }, [])

  useEffect(() => {
    if (estado === 'invalido') {
      router.replace('/recuperar?error=enlace_invalido')
    }
  }, [estado, router])

  // Spec: SC-006 — 100% client-side, supabase.auth.updateUser() ya exige sesión de recuperación
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmar) {
      setError('La nueva contraseña y su confirmación no coinciden.')
      return
    }
    const errorValidacion = validarPassword(password)
    if (errorValidacion) {
      setError(errorValidacion)
      return
    }

    setCargando(true)
    const supabase = createSupabaseBrowserClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setCargando(false)

    if (updateError) {
      setError('No se pudo actualizar la contraseña. Intenta de nuevo o solicita un nuevo enlace.')
      return
    }

    setExito(true)
    await supabase.auth.signOut()
    setTimeout(() => router.push('/login'), 2500)
  }

  if (estado !== 'valido') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-slate-400 text-sm">Verificando enlace...</p>
      </div>
    )
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
            <p className="text-xs text-slate-400 tracking-wide">ARLIFT S.A. — Gestión de Compras</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Nueva contraseña</h2>
          <p className="text-slate-400 text-sm mt-1">
            Define la nueva contraseña de tu cuenta.
          </p>
        </div>

        {exito ? (
          <div className="flex items-start gap-2 text-teal-800 text-sm bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
            <span className="shrink-0 mt-0.5">✓</span>
            <span>Contraseña actualizada. Serás redirigido al inicio de sesión...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
                Nueva contraseña
              </Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="mt-1.5 h-11 text-sm border-slate-200 focus:border-teal-600 focus:ring-teal-600"
              />
              <p className="text-xs text-slate-400 mt-1.5">Mínimo 8 caracteres, 1 mayúscula y 1 número.</p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
                Confirmar contraseña
              </Label>
              <Input
                type="password"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required
                autoComplete="new-password"
                className="mt-1.5 h-11 text-sm border-slate-200 focus:border-teal-600 focus:ring-teal-600"
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
              {cargando ? 'Guardando...' : 'Guardar nueva contraseña'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
