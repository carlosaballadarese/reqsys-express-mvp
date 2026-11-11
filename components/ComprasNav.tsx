'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { NAV, gruposVisibles, itemsVisibles, type GrupoNav, type Rol } from '@/lib/nav-config'

type Perfil = { nombre: string; rol: string; email: string }

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

// Spec: SC-008-v2.md — íconos SVG inline del sidebar (mismo patrón ya usado
// en el resto del proyecto, sin librería de iconografía nueva).
function Icono({ nombre }: { nombre: GrupoNav['icono'] }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true }
  switch (nombre) {
    case 'inicio':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" /></svg>
    case 'nps':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
    case 'compras':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
    case 'bodega':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
    case 'oca':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
    case 'reportes':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
    case 'configuracion':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  }
}

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

  const rol      = (perfil?.rol ?? '') as Rol | ''
  const visibles = gruposVisibles(rol)
  const configuracion = NAV.find(g => g.label === 'Configuración')
  const configuracionVisible = configuracion ? gruposVisibles(rol).some(g => g.label === 'Configuración') : false

  function isGroupActive(g: GrupoNav): boolean {
    if (g.href) return g.exact ? pathname === g.href : pathname.startsWith(g.href)
    return itemsVisibles(g, rol).some(c => c.exact ? pathname === c.href : pathname.startsWith(c.href + '/'))
  }

  function isChildActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const activeStyle   = { background: '#c9a840' }
  const activeClass   = 'text-[#0d2e2e]'
  const inactiveClass = 'text-white/70 hover:text-white hover:bg-white/10'

  function IconoSidebar({ grupo, abrirHaciaArriba }: { grupo: GrupoNav; abrirHaciaArriba?: boolean }) {
    const active = isGroupActive(grupo)
    const open   = dropdown === grupo.label

    // Ícono directo (ej. "Inicio", sin hijos)
    if (grupo.href) {
      return (
        <Link href={grupo.href} title={grupo.label}
          className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${active ? activeClass : inactiveClass}`}
          style={active ? activeStyle : {}}>
          <Icono nombre={grupo.icono} />
        </Link>
      )
    }

    const hijos = itemsVisibles(grupo, rol)

    // CA-19 (comportamiento preexistente): un solo hijo visible -> enlace directo
    if (hijos.length === 1) {
      const solo = hijos[0]
      const soloActive = isChildActive(solo.href)
      return (
        <Link href={solo.href} title={grupo.label}
          className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${soloActive ? activeClass : inactiveClass}`}
          style={soloActive ? activeStyle : {}}>
          <Icono nombre={grupo.icono} />
        </Link>
      )
    }

    return (
      <div className="relative">
        <button type="button" title={grupo.label}
          onClick={() => setDropdown(open ? null : grupo.label)}
          className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${active ? activeClass : inactiveClass}`}
          style={active ? activeStyle : {}}>
          <Icono nombre={grupo.icono} />
        </button>

        {open && (
          <div className={`absolute ${abrirHaciaArriba ? 'bottom-0' : 'top-0'} left-full ml-2 min-w-[220px] bg-white rounded-md shadow-xl border border-slate-100 z-50 py-1 overflow-hidden`}
            style={{ borderLeft: '3px solid #1a5252' }}>
            <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">{grupo.label}</p>
            {hijos.map(hijo => (
              <Link key={hijo.label} href={hijo.href}>
                <span className={`flex items-center px-4 py-2 text-sm transition-colors ${
                  isChildActive(hijo.href)
                    ? 'bg-teal-50 text-[#1a5252] font-semibold border-l-2 border-[#1a5252]'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-[#1a5252]'
                }`}>
                  {hijo.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <nav ref={navRef} aria-label="Navegación principal"
        className="sticky top-0 h-screen w-16 shrink-0 shadow-lg flex flex-col items-center py-4 z-50"
        style={{ background: 'linear-gradient(180deg, #0d2e2e 0%, #1a5252 55%, #0f3535 100%)' }}>

        <Link href="/compras/inicio" className="mb-5" title="REQSYS">
          <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
            style={{ background: '#c9a840', color: '#0d2e2e' }}>R</span>
        </Link>

        <div className="hidden md:flex flex-col gap-1 items-center">
          {visibles.filter(g => g.label !== 'Configuración').map(grupo => (
            <IconoSidebar key={grupo.label} grupo={grupo} />
          ))}
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex flex-col gap-2 items-center">
          {configuracionVisible && configuracion && <IconoSidebar grupo={configuracion} abrirHaciaArriba />}
          {perfil && (
            <Link href="/compras/perfil" title={`${perfil.nombre} — Mi Perfil`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              {perfil.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
            </Link>
          )}
        </div>

        {/* Hamburger mobile */}
        <button onClick={() => setMenuAbierto(!menuAbierto)} className="md:hidden mt-2 p-2 rounded-md hover:bg-white/10">
          <div className="space-y-1">
            <span className="block w-5 h-0.5 bg-white" />
            <span className="block w-5 h-0.5 bg-white" />
            <span className="block w-5 h-0.5 bg-white" />
          </div>
        </button>

        {/* Mobile panel */}
        {menuAbierto && (
          <div className="md:hidden fixed inset-y-0 left-16 w-64 bg-[#0d2e2e] shadow-xl overflow-y-auto py-4 px-2 space-y-0.5">
            {visibles.map(grupo => {
              const hijos = grupo.href ? null : itemsVisibles(grupo, rol)
              if (grupo.href) {
                const active = isGroupActive(grupo)
                return (
                  <Link key={grupo.label} href={grupo.href}>
                    <span className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${active ? activeClass : 'text-white/80'}`}
                      style={active ? activeStyle : {}}>
                      <Icono nombre={grupo.icono} />{grupo.label}
                    </span>
                  </Link>
                )
              }
              if (!hijos || hijos.length === 0) return null
              if (hijos.length === 1) {
                const solo = hijos[0]
                const soloActive = isChildActive(solo.href)
                return (
                  <Link key={grupo.label} href={solo.href}>
                    <span className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${soloActive ? activeClass : 'text-white/80'}`}
                      style={soloActive ? activeStyle : {}}>
                      <Icono nombre={grupo.icono} />{grupo.label}
                    </span>
                  </Link>
                )
              }
              return (
                <div key={grupo.label} className="pt-1">
                  <p className="flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/40">
                    <Icono nombre={grupo.icono} />{grupo.label}
                  </p>
                  {hijos.map(hijo => (
                    <Link key={hijo.label} href={hijo.href}>
                      <span className={`block px-9 py-1.5 text-sm rounded-md ${
                        isChildActive(hijo.href) ? 'text-[#c9a840] font-semibold' : 'text-white/70 hover:text-white'
                      }`}>
                        {hijo.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )
            })}
            <div className="px-3 pt-3 border-t border-white/10 mt-2 space-y-2">
              {perfil && (
                <Link href="/compras/perfil" className="flex items-center justify-between text-xs text-white/70 hover:text-white">
                  <span>{perfil.nombre} — {ROL_LABEL[perfil.rol] ?? perfil.rol}</span>
                  <span className="underline">Mi Perfil</span>
                </Link>
              )}
              <button onClick={handleLogout} className="text-xs text-red-300 hover:text-red-200">Cerrar sesión</button>
            </div>
          </div>
        )}
      </nav>

      <div className="flex-1 min-w-0">
        {/* Barra superior — conserva el botón Salir existente hoy; el
            nombre+rol se mueve al avatar del sidebar (CA-12). */}
        <div className="hidden md:flex items-center justify-end h-12 px-4 border-b border-slate-200 bg-white gap-3">
          {perfil && (
            <span className="text-xs text-slate-500">{perfil.nombre} · {ROL_LABEL[perfil.rol] ?? perfil.rol}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-md transition-all text-white"
            style={{ background: '#1a5252' }}
          >
            Salir
          </button>
        </div>
        <main>{children}</main>
      </div>
    </div>
  )
}
