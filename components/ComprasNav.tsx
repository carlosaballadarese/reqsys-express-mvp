'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type Perfil   = { nombre: string; rol: string; email: string }
type NavChild = { href: string; label: string }
type NavGroup = {
  label: string
  href?: string
  roles: string[]
  exact?: boolean
  children?: NavChild[]
}

const ROL_LABEL: Record<string, string> = {
  solicitante: 'Solicitante',
  compras:     'Compras',
  gerencia:    'Gerencia',
  consulta:    'Consulta',
  admin:       'Administrador',
  bodega:      'Bodega',
  coordinador: 'Coordinador',
}

const NAV: NavGroup[] = [
  { label: 'Mis NPs',   href: '/compras', roles: ['solicitante'],                                                    exact: true },
  { label: 'NPs',       href: '/compras', roles: ['compras','admin','gerencia','consulta','coordinador','bodega'],   exact: true },
  { label: 'Dashboard', href: '/compras/dashboard', roles: ['compras','admin','gerencia','consulta','coordinador','solicitante','bodega'] },
  {
    label: 'Compras', roles: ['compras','admin','gerencia','consulta'],
    children: [
      { href: '/compras/ordenes',     label: 'Órdenes de Compra' },
      { href: '/compras/proveedores', label: 'Proveedores' },
    ],
  },
  {
    label: 'Bodega', roles: ['compras','admin','gerencia','bodega'],
    children: [
      { href: '/compras/inventario', label: 'Inventario' },
    ],
  },
  {
    label: 'Configuración', roles: ['compras','admin'],
    children: [
      { href: '/compras/coordinadores', label: 'Coordinadores' },
      { href: '/compras/accesos',       label: 'Accesos' },
      { href: '/compras/configuracion', label: 'Numeraciones' },
      { href: '/compras/auditoria',     label: 'Auditoría' },
    ],
  },
]

export default function ComprasNav({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil]         = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [dropdown, setDropdown]     = useState<string | null>(null)
  const pathname = usePathname()
  const router   = useRouter()
  const navRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPerfil(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setDropdown(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { setDropdown(null); setMenuAbierto(false) }, [pathname])

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const rol      = perfil?.rol ?? ''
  const visibles = NAV.filter(g => g.roles.includes(rol))

  function isGroupActive(g: NavGroup): boolean {
    if (g.href) return g.exact ? pathname === g.href : pathname.startsWith(g.href)
    return g.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/')) ?? false
  }

  function isChildActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const activeStyle = { background: '#c9a840' }
  const activeClass = 'text-[#0d2e2e] font-semibold'
  const inactiveClass = 'text-white/80 hover:text-white hover:bg-white/10'

  return (
    <div className="min-h-screen bg-slate-50">
      <nav
        ref={navRef}
        className="sticky top-0 z-50 shadow-lg text-white"
        style={{ background: 'linear-gradient(90deg, #0d2e2e 0%, #1a5252 60%, #0f3535 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <Link href="/compras" className="flex items-center gap-2 shrink-0">
              <Image src="/logo-reqsys.png" alt="REQSYS" width={34} height={34} className="rounded-full ring-1 ring-white/20" />
              <div className="flex items-baseline gap-1.5">
                <span className="font-black text-white text-base tracking-wide">
                  REQ<span style={{ color: '#c9a840' }}>SYS</span>
                </span>
                <span className="text-xs hidden sm:block" style={{ color: 'rgba(201,168,64,0.7)' }}>ARLIFT S.A.</span>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5 flex-1 px-4">
              {visibles.map(group => {
                const active = isGroupActive(group)
                const open   = dropdown === group.label

                if (!group.children) {
                  return (
                    <Link key={group.label} href={group.href!}>
                      <span
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all inline-block ${active ? activeClass : inactiveClass}`}
                        style={active ? activeStyle : {}}
                      >
                        {group.label}
                      </span>
                    </Link>
                  )
                }

                return (
                  <div key={group.label} className="relative">
                    <button
                      onClick={() => setDropdown(open ? null : group.label)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${active ? activeClass : inactiveClass}`}
                      style={active ? activeStyle : {}}
                    >
                      {group.label}
                      <svg
                        className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {open && (
                      <div className="absolute top-full left-0 mt-1.5 min-w-[180px] bg-white rounded-md shadow-xl border border-slate-100 z-50 py-1 overflow-hidden"
                           style={{ borderTop: '3px solid #1a5252' }}>
                        {group.children.map(child => (
                          <Link key={child.label} href={child.href}>
                            <span className={`flex items-center px-4 py-2 text-sm transition-colors ${
                              isChildActive(child.href)
                                ? 'bg-teal-50 text-[#1a5252] font-semibold border-l-2 border-[#1a5252]'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-[#1a5252]'
                            }`}>
                              {child.label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Usuario + Salir */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {perfil && (
                <div className="text-right">
                  <p className="text-white text-xs font-medium leading-tight">{perfil.nombre}</p>
                  <p className="text-xs leading-tight" style={{ color: 'rgba(201,168,64,0.8)' }}>
                    {ROL_LABEL[perfil.rol] ?? perfil.rol}
                  </p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-white text-xs px-3 py-1.5 rounded-md transition-all hover:bg-red-700/80"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                Salir
              </button>
            </div>

            {/* Hamburger mobile */}
            <button onClick={() => setMenuAbierto(!menuAbierto)} className="md:hidden p-2 rounded-md hover:bg-white/10">
              <div className="space-y-1">
                <span className="block w-5 h-0.5 bg-white" />
                <span className="block w-5 h-0.5 bg-white" />
                <span className="block w-5 h-0.5 bg-white" />
              </div>
            </button>
          </div>

          {/* Mobile menu */}
          {menuAbierto && (
            <div className="md:hidden pb-3 pt-2 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {visibles.map(group => {
                const active = isGroupActive(group)
                if (!group.children) {
                  return (
                    <Link key={group.label} href={group.href!}>
                      <span
                        className={`block px-3 py-2 rounded-md text-sm font-medium ${active ? activeClass : 'text-white/80'}`}
                        style={active ? activeStyle : {}}
                      >
                        {group.label}
                      </span>
                    </Link>
                  )
                }
                return (
                  <div key={group.label} className="pt-1">
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/40">
                      {group.label}
                    </p>
                    {group.children.map(child => (
                      <Link key={child.label} href={child.href}>
                        <span className={`block px-6 py-1.5 text-sm rounded-md ${
                          isChildActive(child.href) ? 'text-[#c9a840] font-semibold' : 'text-white/70 hover:text-white'
                        }`}>
                          {child.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                )
              })}
              {perfil && (
                <div className="px-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <p className="text-white text-xs font-medium">{perfil.nombre}</p>
                    <p className="text-xs" style={{ color: 'rgba(201,168,64,0.8)' }}>{ROL_LABEL[perfil.rol] ?? perfil.rol}</p>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-200">Cerrar sesión</button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <main>{children}</main>
    </div>
  )
}
