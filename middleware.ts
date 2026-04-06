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

// Solo admin
const ADMIN_ONLY = ['/compras/accesos']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function requiresCompras(pathname: string) {
  return COMPRAS_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function requiresAdmin(pathname: string) {
  return ADMIN_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
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

  // Ruta raíz — redirigir según rol después de autenticar
  if (pathname === '/') {
    // Construir cliente para leer sesión
    let resRoot = NextResponse.next({ request: req })
    const supabaseRoot = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()              { return req.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
            resRoot = NextResponse.next({ request: req })
            cookiesToSet.forEach(({ name, value, options }) => resRoot.cookies.set(name, value, options))
          },
        },
      }
    )
    const { data: { user: userRoot } } = await supabaseRoot.auth.getUser()
    if (userRoot) {
      const { createClient: cc } = await import('@supabase/supabase-js')
      const adminRoot = cc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: perfilRoot } = await adminRoot.from('perfiles').select('rol').eq('id', userRoot.id).single()
      if (perfilRoot && perfilRoot.rol !== 'solicitante') {
        return NextResponse.redirect(new URL('/compras/dashboard', req.url))
      }
    }
    return NextResponse.next()
  }

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

  // Admin only
  if (requiresAdmin(pathname) && rol !== 'admin') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Rutas de compras/dashboard/nps — solo compras, gerencia, consulta, admin
  // solicitante no puede entrar
  if (requiresCompras(pathname)) {
    // solicitante solo puede ver /compras (sus NPs) — nada más
    if (rol === 'solicitante') {
      const permitidasSolicitante = pathname === '/compras' || /^\/compras\/[^/]+$/.test(pathname)
      if (!permitidasSolicitante) {
        return NextResponse.redirect(new URL('/compras', req.url))
      }
    }


    // gerencia y consulta: solo lectura — pueden ver NPs, OCs, dashboard
    // pero NO pueden entrar a inventario, proveedores, accesos
    if (rol === 'gerencia' || rol === 'consulta') {
      const bloqueadas = [
        '/compras/inventario',
        '/compras/proveedores',
        '/compras/accesos',
        '/compras/ordenes/nueva',
      ]
      const estaBloqueada = bloqueadas.some(
        b => pathname === b || pathname.startsWith(b + '/')
      )
      // Para OCs y NPs en detalle: bloquear edición (se maneja en la página)
      if (estaBloqueada) {
        return NextResponse.redirect(new URL('/compras/dashboard', req.url))
      }
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
