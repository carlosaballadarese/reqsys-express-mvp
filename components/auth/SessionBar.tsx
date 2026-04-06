'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

type Perfil = {
  nombre: string
  rol: string
  email: string
}

const ROL_LABEL: Record<string, string> = {
  solicitante: 'Solicitante',
  compras:     'Compras',
  gerencia:    'Gerencia',
  consulta:    'Consulta',
  admin:       'Administrador',
}

export function SessionBar() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error) setPerfil(data) })
      .catch(() => {})
  }, [])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!perfil) return null

  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">
        <p className="text-white text-xs font-medium">{perfil.nombre}</p>
        <p className="text-blue-300 text-xs">{ROL_LABEL[perfil.rol] ?? perfil.rol}</p>
      </div>
      {perfil.rol === 'admin' && (
        <Link href="/compras/accesos">
          <button className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-md">
            Accesos
          </button>
        </Link>
      )}
      <button
        onClick={handleLogout}
        className="bg-white/10 hover:bg-red-500/80 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
