'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

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

type NavItem = {
  href: string
  label: string
  roles: string[]
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/compras',              label: 'Mis NPs',           roles: ['solicitante'],                              exact: true },
  { href: '/compras',              label: 'NPs',               roles: ['compras', 'admin', 'gerencia', 'consulta'], exact: true },
  { href: '/compras/ordenes',      label: 'Órdenes de Compra', roles: ['compras', 'admin', 'gerencia', 'consulta'] },
  { href: '/compras/proveedores',  label: 'Proveedores',       roles: ['compras', 'admin'] },
  { href: '/compras/inventario',   label: 'Inventario',        roles: ['compras', 'admin'] },
  { href: '/compras/accesos',      label: 'Accesos',           roles: ['admin'] },
  { href: '/compras/auditoria',    label: 'Auditoría',         roles: ['admin', 'compras'] },
  { href: '/compras/dashboard',    label: 'Dashboard',         roles: ['compras', 'admin', 'gerencia', 'consulta'] },
]

export default function ComprasNav({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const pathname = usePathname()
  const router   = useRouter()

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

  const rol = perfil?.rol ?? ''
  const navItems = NAV_ITEMS.filter(item => item.roles.includes(rol))

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-blue-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">

            <Link href="/compras" className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-white text-base tracking-wide">REQSYS</span>
              <span className="text-blue-400 text-xs hidden sm:block">ARLIFT S.A.</span>
            </Link>

            <div className="hidden md:flex items-center gap-1 flex-1 px-6">
              {navItems.map(item => (
                <Link key={item.href + item.label} href={item.href}>
                  <span className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive(item)
                      ? 'bg-white text-blue-900'
                      : 'text-blue-100 hover:bg-blue-800'
                  }`}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3 shrink-0">
              {perfil && (
                <div className="text-right">
                  <p className="text-white text-xs font-medium leading-tight">{perfil.nombre}</p>
                  <p className="text-blue-400 text-xs leading-tight">{ROL_LABEL[perfil.rol] ?? perfil.rol}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="bg-blue-800 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
              >
                Salir
              </button>
            </div>

            <button
              onClick={() => setMenuAbierto(!menuAbierto)}
              className="md:hidden p-2 rounded-md hover:bg-blue-800"
            >
              <div className="space-y-1">
                <span className="block w-5 h-0.5 bg-white"></span>
                <span className="block w-5 h-0.5 bg-white"></span>
                <span className="block w-5 h-0.5 bg-white"></span>
              </div>
            </button>
          </div>

          {menuAbierto && (
            <div className="md:hidden pb-3 pt-1 border-t border-blue-800 space-y-1">
              {navItems.map(item => (
                <Link key={item.href + item.label} href={item.href} onClick={() => setMenuAbierto(false)}>
                  <span className={`block px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(item)
                      ? 'bg-white text-blue-900'
                      : 'text-blue-100 hover:bg-blue-800'
                  }`}>
                    {item.label}
                  </span>
                </Link>
              ))}
              {perfil && (
                <div className="px-3 pt-2 border-t border-blue-800 flex items-center justify-between">
                  <div>
                    <p className="text-white text-xs font-medium">{perfil.nombre}</p>
                    <p className="text-blue-400 text-xs">{ROL_LABEL[perfil.rol] ?? perfil.rol}</p>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-200">
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <main>
        {children}
      </main>
    </div>
  )
}
