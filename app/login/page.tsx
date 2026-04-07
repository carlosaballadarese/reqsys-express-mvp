'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

    // Leer rol para redirigir correctamente
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

    // Redirigir según rol
    const rol = perfil.rol
    if (rol === 'solicitante') {
      router.push('/')
    } else if (nextPath && nextPath !== '/login' && nextPath !== '/') {
      router.push(nextPath)
    } else {
      router.push('/compras/dashboard')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-800">REQSYS</h1>
          <p className="text-slate-500 text-sm mt-1">ARLIFT S.A. — Sistema de Gestión de Requerimientos</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-slate-700 text-center">Iniciar Sesión</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label className="text-xs">Correo electrónico</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1 h-9 text-sm"
                  placeholder="usuario@arlift.com.ec"
                />
              </div>
              <div>
                <Label className="text-xs">Contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="mt-1 h-9 text-sm"
                />
              </div>

              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={cargando} className="w-full bg-blue-700 hover:bg-blue-800 h-9">
                {cargando ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          ¿Problemas para acceder? Contacta al administrador del sistema.
        </p>
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
