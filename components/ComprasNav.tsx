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

type PassForm = {
  actual: string
  nueva: string
  confirmar: string
  cargando: boolean
  error: string | null
  exito: boolean
}

const PASS_VACIO: PassForm = {
  actual: '', nueva: '', confirmar: '', cargando: false, error: null, exito: false,
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

function policyOk(p: string) {
  return {
    largo:     p.length >= 8,
    mayuscula: /[A-Z]/.test(p),
    numero:    /[0-9]/.test(p),
  }
}

export default function ComprasNav({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil]           = useState<Perfil | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [dropdown, setDropdown]       = useState<string | null>(null)
  const [modalPass, setModalPass]     = useState(false)
  const [pass, setPass]               = useState<PassForm>(PASS_VACIO)
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

  function abrirModal() {
    setPass(PASS_VACIO)
    setModalPass(true)
    setMenuAbierto(false)
  }

  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    setPass(p => ({ ...p, cargando: true, error: null }))

    const res  = await fetch('/api/auth/cambiar-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passwordActual:  pass.actual,
        passwordNuevo:   pass.nueva,
        passwordConfirm: pass.confirmar,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setPass(p => ({ ...p, cargando: false, error: data.error ?? 'Error desconocido.' }))
    } else {
      setPass(p => ({ ...p, cargando: false, exito: true }))
    }
  }

  const rol      = perfil?.rol ?? ''
  const visibles = NAV.filter(g => g.roles.includes(rol))
  const policy   = policyOk(pass.nueva)

  function isGroupActive(g: NavGroup): boolean {
    if (g.href) return g.exact ? pathname === g.href : pathname.startsWith(g.href)
    return g.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/')) ?? false
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

            {/* Usuario + Cambiar pass + Salir */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {perfil && (
                <button
                  onClick={abrirModal}
                  title="Cambiar contraseña"
                  className="text-right group"
                >
                  <p className="text-white text-xs font-medium leading-tight group-hover:underline">{perfil.nombre}</p>
                  <p className="text-xs leading-tight" style={{ color: 'rgba(201,168,64,0.8)' }}>
                    {ROL_LABEL[perfil.rol] ?? perfil.rol}
                  </p>
                </button>
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
                  <div className="flex items-center gap-3">
                    <button onClick={abrirModal} className="text-xs text-white/70 hover:text-white underline">
                      Cambiar contraseña
                    </button>
                    <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-200">Cerrar sesión</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <main>{children}</main>

      {/* Modal cambio de contraseña */}
      {modalPass && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalPass(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
              <h2 className="text-white font-semibold text-base">Cambiar contraseña</h2>
              {perfil && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(201,168,64,0.9)' }}>{perfil.nombre}</p>
              )}
            </div>

            {pass.exito ? (
              <div className="px-6 py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-slate-800 font-semibold mb-1">Contraseña actualizada</p>
                <p className="text-sm text-slate-500 mb-6">Se envió una notificación a tu correo.</p>
                <button
                  onClick={() => setModalPass(false)}
                  className="w-full py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#1a5252' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleCambiarPassword} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña actual</label>
                  <input
                    type="password"
                    value={pass.actual}
                    onChange={e => setPass(p => ({ ...p, actual: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
                  <input
                    type="password"
                    value={pass.nueva}
                    onChange={e => setPass(p => ({ ...p, nueva: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                  {pass.nueva.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {[
                        { ok: policy.largo,     label: 'Mínimo 8 caracteres' },
                        { ok: policy.mayuscula, label: 'Al menos una mayúscula' },
                        { ok: policy.numero,    label: 'Al menos un número' },
                      ].map(({ ok, label }) => (
                        <p key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600' : 'text-slate-400'}`}>
                          <span>{ok ? '✓' : '○'}</span>{label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar nueva contraseña</label>
                  <input
                    type="password"
                    value={pass.confirmar}
                    onChange={e => setPass(p => ({ ...p, confirmar: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                  {pass.confirmar.length > 0 && pass.nueva !== pass.confirmar && (
                    <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                  )}
                </div>

                {pass.error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                    {pass.error}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModalPass(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pass.cargando}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                    style={{ background: '#1a5252' }}
                  >
                    {pass.cargando ? 'Guardando...' : 'Cambiar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
