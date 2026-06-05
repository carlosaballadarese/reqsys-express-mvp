import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Rutas completamente públicas — no requieren sesión
const PUBLIC_PATHS = [
  '/login',
  '/aprobar',
  '/devolver',
  '/editar',
]

// Rutas que requieren rol específico (compras o admin)
const COMPRAS_ONLY = [
  '/compras',
]

// Solo admin (ninguna ruta exclusiva de admin por ahora)
const ADMIN_ONLY: string[] = []

// Admin y compras
const ADMIN_COMPRAS_ONLY = ['/compras/auditoria', '/compras/configuracion', '/compras/accesos', '/compras/empresa']

// Dashboard OCs — fuente de verdad para acceso a /compras/dashboard-ocs
const DASHBOARD_OCS_ROLES = ['compras', 'admin', 'asistente_compras', 'gerencia']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function requiresCompras(pathname: string) {
  return COMPRAS_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function requiresAdmin(pathname: string) {
  return ADMIN_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function requiresAdminOrCompras(pathname: string) {
  return ADMIN_COMPRAS_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pasar archivos estáticos sin tocar
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Rutas públicas — sin chequeo
  if (isPublic(pathname)) return NextResponse.next()

  // Construir respuesta base para que Supabase pueda refrescar cookies
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()              { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // No autenticado → login
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Leer rol del perfil via service role (evita RLS)
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: perfil } = await admin
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .single()

  // Sin perfil o inactivo → logout forzado
  if (!perfil || !perfil.activo) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'sin_acceso')
    return NextResponse.redirect(url)
  }

  const rol = perfil.rol as string

  // Dashboard OCs — roles no autorizados redirigen a Dashboard NPs
  if (
    (pathname === '/compras/dashboard-ocs' || pathname.startsWith('/compras/dashboard-ocs/')) &&
    !DASHBOARD_OCS_ROLES.includes(rol)
  ) {
    return NextResponse.redirect(new URL('/compras/dashboard', req.url))
  }

  // Admin only
  if (requiresAdmin(pathname) && rol !== 'admin') {
    return NextResponse.redirect(new URL('/compras/dashboard', req.url))
  }

  // Admin o compras
  if (requiresAdminOrCompras(pathname) && !['admin', 'compras'].includes(rol)) {
    return NextResponse.redirect(new URL('/compras/dashboard', req.url))
  }

  if (requiresCompras(pathname)) {
    // solicitante: solo sus NPs y dashboard
    if (rol === 'solicitante') {
      const permitidasSolicitante = ['/compras', '/compras/dashboard']
      const permitida = permitidasSolicitante.includes(pathname) || /^\/compras\/[^/]+$/.test(pathname)
      if (!permitida) {
        return NextResponse.redirect(new URL('/compras', req.url))
      }
    }

    // bodega: inventario, nueva NP, lista NPs, detalle NP, dashboard
    if (rol === 'bodega') {
      const bloqueadas = [
        '/compras/ordenes',
        '/compras/proveedores',
        '/compras/coordinadores',
        '/compras/accesos',
        '/compras/auditoria',
        '/compras/configuracion',
      ]
      const bloqueada = bloqueadas.some(b => pathname === b || pathname.startsWith(b + '/'))
      if (bloqueada) {
        return NextResponse.redirect(new URL('/compras/inventario', req.url))
      }
    }

    // gerencia y consulta: solo lectura
    if (rol === 'gerencia' || rol === 'consulta') {
      const bloqueadas = [
        '/compras/proveedores',
        '/compras/accesos',
        '/compras/ordenes/nueva',
      ]
      const estaBloqueada = bloqueadas.some(
        b => pathname === b || pathname.startsWith(b + '/')
      )
      if (estaBloqueada) {
        return NextResponse.redirect(new URL('/compras/dashboard', req.url))
      }
    }

    // coordinador: solo lista de NPs y detalle de NP individual
    if (rol === 'coordinador') {
      const permitida = pathname === '/compras' || /^\/compras\/[^/]+$/.test(pathname)
      if (!permitida) {
        return NextResponse.redirect(new URL('/compras', req.url))
      }
    }

    // Spec: asistente_compras — NPs, dashboard, ordenes, proveedores, nueva NP, detalle NP
    if (rol === 'asistente_compras') {
      const bloqueadas = [
        '/compras/inventario',
        '/compras/coordinadores',
        '/compras/accesos',
        '/compras/auditoria',
        '/compras/configuracion',
      ]
      const bloqueada = bloqueadas.some(b => pathname === b || pathname.startsWith(b + '/'))
      if (bloqueada) {
        return NextResponse.redirect(new URL('/compras', req.url))
      }
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
