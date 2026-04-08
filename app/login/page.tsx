'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const ERROR_MSG: Record<string, string> = {
  sin_acceso: 'Tu cuenta no tiene acceso al sistema. Contacta al administrador.',
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const nextPath     = searchParams.get('next') || '/'
  const errorParam   = searchParams.get('error')

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(errorParam ? ERROR_MSG[errorParam] ?? '' : '')
  const [cargando, setCargando] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError('')

    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Email o contraseña incorrectos')
      setCargando(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Error al obtener sesión'); setCargando(false); return }

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol, activo')
      .eq('id', user.id)
      .single()

    if (!perfil || !perfil.activo) {
      await supabase.auth.signOut()
      setError('Tu cuenta no tiene acceso. Contacta al administrador.')
      setCargando(false)
      return
    }

    const rol = perfil.rol
    if (rol === 'solicitante') {
      router.push('/compras/nueva')
    } else if (rol === 'bodega') {
      router.push('/compras/inventario')
    } else if (nextPath && nextPath !== '/login' && nextPath !== '/' && nextPath !== '/compras/nueva') {
      router.push(nextPath)
    } else {
      router.push('/compras/dashboard')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Panel izquierdo — Branding ── */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col items-center justify-between py-12 px-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f3535 0%, #1a5252 45%, #0d2e2e 100%)' }}
      >
        {/* Fondo decorativo */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #c9a840 0%, transparent 70%)' }} />
          <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #c9a840 0%, transparent 70%)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5"
            style={{ border: '1px solid #c9a840' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full opacity-5"
            style={{ border: '1px solid #c9a840' }} />
        </div>

        {/* Header — tagline */}
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase"
            style={{ border: '1px solid rgba(201,168,64,0.4)', color: '#c9a840', background: 'rgba(201,168,64,0.08)' }}>
            REQSYS for ARLIFT S.A.
          </div>
        </div>

        {/* Logo REQSYS + texto central */}
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-20"
              style={{ background: '#c9a840', transform: 'scale(0.9)' }} />
            <Image
              src="/logo-reqsys.png"
              alt="REQSYS"
              width={220}
              height={220}
              className="relative drop-shadow-2xl"
              style={{ filter: 'drop-shadow(0 0 24px rgba(201,168,64,0.3))' }}
            />
          </div>

          <div>
            <h1 className="text-5xl font-black tracking-tight text-white">
              REQ<span style={{ color: '#c9a840' }}>SYS</span>
            </h1>
            <p className="text-sm font-light tracking-widest uppercase mt-1"
              style={{ color: 'rgba(201,168,64,0.8)' }}>
              Sistema de Gestión de Compras
            </p>
          </div>

          {/* Separador dorado */}
          <div className="w-16 h-px" style={{ background: 'linear-gradient(90deg, transparent, #c9a840, transparent)' }} />

          <p className="text-sm max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Digitaliza el flujo de requerimientos de compras,<br />
            desde la solicitud hasta la orden de compra.
          </p>
        </div>

        {/* Footer — CABE */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Desarrollado por
          </p>
          <Image
            src="/logo-cabe.png"
            alt="CABE Business Solutions"
            width={72}
            height={72}
            className="rounded-full opacity-80 hover:opacity-100 transition-opacity"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
          />
          <p className="text-xs font-semibold" style={{ color: 'rgba(201,168,64,0.7)' }}>
            CABE Business Solutions &amp; Innovation
          </p>
        </div>
      </div>

      {/* ── Panel derecho — Login ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-white">

        {/* Logo mobile */}
        <div className="lg:hidden flex flex-col items-center mb-8 gap-3">
          <Image src="/logo-reqsys.png" alt="REQSYS" width={80} height={80} />
          <div className="text-center">
            <h1 className="text-2xl font-black text-slate-800">
              REQ<span className="text-amber-600">SYS</span>
            </h1>
            <p className="text-xs text-slate-400 tracking-wide">ARLIFT S.A. — Gestión de Compras</p>
          </div>
        </div>

        <div className="w-full max-w-sm">

          {/* Encabezado formulario */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Bienvenido</h2>
            <p className="text-slate-400 text-sm mt-1">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
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
                placeholder="usuario@arlift.com.ec"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
                Contraseña
              </Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
              {cargando ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Verificando...
                </span>
              ) : 'Ingresar'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8 leading-relaxed">
            ¿Problemas para acceder?<br />
            Contacta al administrador del sistema.
          </p>
        </div>

        {/* Footer mobile */}
        <div className="lg:hidden mt-12 flex items-center gap-2 opacity-50">
          <Image src="/logo-cabe.png" alt="CABE" width={24} height={24} className="rounded-full" />
          <span className="text-xs text-slate-400">CABE Business Solutions</span>
        </div>
      </div>

    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
