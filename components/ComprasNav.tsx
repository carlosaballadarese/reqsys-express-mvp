'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type Perfil   = { nombre: string; rol: string; email: string }
type NavChild = { href: string; label: string; roles?: string[]; exact?: boolean }
type NavGroup = {
  label: string
  href?: string
  roles: string[]
  exact?: boolean
  children?: NavChild[]
  separator?: boolean
}

const ROL_LABEL: Record<string, string> = {
  solicitante:       'Solicitante',
  compras:           'Compras',
  gerencia:          'Gerencia',
  consulta:          'Consulta',
  admin:             'Administrador',
  bodega:            'Bodega',
  coordinador:       'Coordinador',
  asistente_compras: 'Asistente Compras',
}

const NAV: NavGroup[] = [
  {
    label: 'NPs',
    roles: ['solicitante','bodega','compras','admin','gerencia','consulta','coordinador','asistente_compras'],
    children: [
      { label: 'Mis NPs',   href: '/compras',       exact: true },
      { label: 'Nueva NP',  href: '/compras/nueva',
        roles: ['solicitante','bodega','compras','admin','asistente_compras','coordinador','gerencia'] },
      // Spec: HU-011 CA-09
      { label: 'Vista por NP', href: '/compras/vista-np',
        roles: ['compras','admin','asistente_compras','gerencia','consulta'] },
    ],
  },
  {
    label: 'Compras',
    roles: ['compras','admin','gerencia','consulta','asistente_compras'],
    children: [
      { label: 'Órdenes de Compra', href: '/compras/ordenes' },
      // Spec: HU-013 CA-06
      { label: 'Líneas Pendientes de OC', href: '/compras/lineas-pendientes',
        roles: ['compras','admin','asistente_compras'] },
      // Spec: SC-007 — mismos roles que ROLES_REPORTE_LINEAS
      { label: 'Reporte de Líneas', href: '/compras/reportes/lineas',
        roles: ['compras','admin','asistente_compras','gerencia'] },
      { label: 'Proveedores',       href: '/compras/proveedores',
        roles: ['compras','admin','asistente_compras'] },
    ],
  },
  {
    label: 'Bodega',
    roles: ['compras','admin','gerencia','bodega'],
    children: [
      { label: 'Inventario', href: '/compras/inventario' },
    ],
  },
  // Spec: HU-018 CA-12 — grupo de nivel superior (no anidado bajo "Compras",
  // que excluye solicitante/bodega), ya que esos 2 roles podrán generar
  // releases contra una OCA vigente (RN-07, Fase D futura). Excluye
  // 'coordinador' a propósito — no está en la lista de roles de la HU.
  // Spec: HU-021 — "Releases pendientes" visible para los MISMOS 7 roles que
  // "Mis OCAs", no restringido a compras/admin/coordinador: verificado contra
  // datos reales que los coordinadores de área activos hoy tienen roles
  // solicitante/coordinador/gerencia/admin (coordinadores_area se matchea por
  // email, no por rol de sistema) — cualquiera de los 7 roles puede terminar
  // teniendo un release pendiente propio. El backend ya devuelve lista vacía
  // sin error cuando no hay nada que aprobar.
  {
    label: 'OCA',
    roles: ['solicitante','bodega','compras','admin','gerencia','consulta','asistente_compras'],
    children: [
      { label: 'Mis OCAs', href: '/compras/ocas', exact: true },
      { label: 'Releases pendientes', href: '/compras/ocas/releases-pendientes' },
      // Spec: HU-023 RN-03 — mismos roles que Dashboard OCs, más restringido
      // que el resto del grupo "OCA" (reportes administrativo-financieros).
      { label: 'Reportes', href: '/compras/ocas/reportes', roles: ['compras', 'admin', 'asistente_compras', 'gerencia'] },
      // Spec: HU-025 RN-06 — mismos roles que "Reportes"
      { label: 'Dashboard', href: '/compras/ocas/dashboard', roles: ['compras', 'admin', 'asistente_compras', 'gerencia'] },
    ],
  },
  {
    label: 'Dashboard',
    roles: ['compras','admin','gerencia','consulta','coordinador','bodega','asistente_compras','solicitante'],
    children: [
      { label: 'Dashboard NPs', href: '/compras/dashboard',     exact: true },
      { label: 'Dashboard OCs', href: '/compras/dashboard-ocs', exact: true,
        roles: ['compras','admin','asistente_compras','gerencia'] },
    ],
  },
  {
    label: 'Configuración',
    roles: ['compras','admin'],
    children: [
      { label: 'Áreas',    href: '/compras/coordinadores' },
      { label: 'Numeraciones',     href: '/compras/configuracion' },
      { label: 'Datos de Empresa', href: '/compras/empresa' },
      { label: 'Feriados',         href: '/compras/feriados' },
      { label: 'Acciones',         href: '/compras/acciones' },
      { label: 'Auditoría',        href: '/compras/auditoria' },
      { label: 'Accesos',          href: '/compras/accesos' },
    ],
  },
]

export default function ComprasNav({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil]           = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [dropdown, setDropdown]       = useState<string | null>(null)
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
    return g.children
      ?.filter(c => !c.roles || c.roles.includes(rol))
      .some(c => c.exact ? pathname === c.href : pathname.startsWith(c.href + '/'))
      ?? false
  }

  function isChildActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const activeStyle  = { background: '#c9a840' }
  const activeClass  = 'text-[#0d2e2e] font-semibold'
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
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5 flex-1 px-4">
              {visibles.map((group, i) => {
                if (group.separator) {
                  return (
                    <span
                      key={`sep-${i}`}
                      className="hidden md:block w-px h-5 bg-white/20 mx-1"
                      aria-hidden="true"
                    />
                  )
                }

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

                const childrenVisibles = group.children.filter(
                  c => !c.roles || c.roles.includes(rol)
                )

                // CA-19: un solo subitem visible → enlace directo sin dropdown
                if (childrenVisibles.length === 1) {
                  const solo = childrenVisibles[0]
                  const soloActive = isChildActive(solo.href)
                  return (
                    <Link key={group.label} href={solo.href}>
                      <span
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all inline-block ${soloActive ? activeClass : inactiveClass}`}
                        style={soloActive ? activeStyle : {}}
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
                        {childrenVisibles.map(child => (
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

            {/* Usuario + Cambiar pass + Salir */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {perfil && (
                <Link href="/compras/perfil" title="Mi Perfil" className="text-right group">
                  <p className="text-white text-xs font-medium leading-tight group-hover:underline">{perfil.nombre}</p>
                  <p className="text-xs leading-tight" style={{ color: 'rgba(201,168,64,0.8)' }}>
                    {ROL_LABEL[perfil.rol] ?? perfil.rol}
                  </p>
                </Link>
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
              {visibles.map((group, i) => {
                if (group.separator) {
                  return (
                    <div
                      key={`sep-${i}`}
                      className="h-px bg-white/20 my-1 mx-3"
                      aria-hidden="true"
                    />
                  )
                }

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
                const childrenVisiblesMobile = group.children.filter(
                  c => !c.roles || c.roles.includes(rol)
                )

                // CA-19: un solo subitem visible → enlace directo sin sección expandida
                if (childrenVisiblesMobile.length === 1) {
                  const solo = childrenVisiblesMobile[0]
                  const soloActive = isChildActive(solo.href)
                  return (
                    <Link key={group.label} href={solo.href}>
                      <span
                        className={`block px-3 py-2 rounded-md text-sm font-medium ${soloActive ? activeClass : 'text-white/80'}`}
                        style={soloActive ? activeStyle : {}}
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
                    {childrenVisiblesMobile.map(child => (
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
                  <div className="flex items-center gap-3">
                    <Link href="/compras/perfil" className="text-xs text-white/70 hover:text-white underline">
                      Mi Perfil
                    </Link>
                    <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-200">Cerrar sesión</button>
                  </div>
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
