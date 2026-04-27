/**
 * Tests de protección de endpoints de la API.
 *
 * Valida que:
 * 1. Endpoints protegidos devuelven 401 sin sesión activa.
 * 2. Endpoints protegidos procesan la request cuando hay sesión válida.
 * 3. El endpoint /inventario/search permanece público (sin auth).
 * 4. /api/devolver busca por token_devolucion, no por token_aprobacion.
 */

import { NextRequest } from 'next/server'

// ── Mocks globales ────────────────────────────────────────────────────────────

const mockGetUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}))

const mockFrom = jest.fn()
const mockAdminClient = jest.fn(() => ({ from: mockFrom }))
const mockAnonClient  = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
  anonClient:  () => mockAnonClient(),
}))

jest.mock('@/lib/mailer', () => ({
  transporter: { sendMail: jest.fn() },
}))

jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIN_SESION  = { data: { user: null } }
const CON_SESION  = { data: { user: { id: 'user-123', email: 'test@arlift.com' } } }

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options)
}

// Cadena de llamadas Supabase: todos los métodos devuelven el chain.
// El chain es awaitable (tiene .then) para soportar `await query` directo.
function mockChainVacio() {
  const resolved = { data: [], error: null }
  const chain: any = {}
  const noop = jest.fn(() => chain)
  chain.select = noop
  chain.order  = noop
  chain.eq     = noop
  chain.or     = noop
  chain.like   = noop
  chain.ilike  = noop
  chain.neq    = noop
  chain.limit  = jest.fn(() => Promise.resolve(resolved))
  chain.single = jest.fn(() => Promise.resolve({ data: null, error: null }))
  chain.insert = jest.fn(() => Promise.resolve(resolved))
  chain.upsert = jest.fn(() => Promise.resolve(resolved))
  chain.update = jest.fn(() => Promise.resolve(resolved))
  chain.delete = jest.fn(() => Promise.resolve(resolved))
  // Permite `await query` cuando el handler no termina en .single()/.limit()
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(resolved).then(resolve, reject)
  return chain
}

// ── 1. Exportar ───────────────────────────────────────────────────────────────

describe('GET /api/exportar/[entidad]', () => {
  const { GET } = require('@/app/api/exportar/[entidad]/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/exportar/nps'), {
      params: Promise.resolve({ entidad: 'nps' }),
    })
    expect(res.status).toBe(401)
  })

  it('pasa el check de auth con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    mockFrom.mockReturnValue(mockChainVacio())
    // Con datos vacíos responde 404 ("Sin datos") — no 401 ni 500
    const res = await GET(makeRequest('http://localhost/api/exportar/nps'), {
      params: Promise.resolve({ entidad: 'nps' }),
    })
    expect(res.status).not.toBe(401)
  })

  it('rechaza entidades no permitidas con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const res = await GET(makeRequest('http://localhost/api/exportar/usuarios'), {
      params: Promise.resolve({ entidad: 'usuarios' }),
    })
    expect(res.status).toBe(400)
  })
})

// ── 2. Inventario — lista y creación ─────────────────────────────────────────

describe('GET /api/compras/inventario', () => {
  const { GET } = require('@/app/api/compras/inventario/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/inventario'))
    expect(res.status).toBe(401)
  })

  it('devuelve 200 con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/inventario'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/compras/inventario', () => {
  const { POST } = require('@/app/api/compras/inventario/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/inventario', {
        method: 'POST',
        body: JSON.stringify({ codigo: 'AL-I0001', descripcion: 'Test' }),
      })
    )
    expect(res.status).toBe(401)
  })
})

// ── 3. Inventario — detalle ───────────────────────────────────────────────────

describe('GET /api/compras/inventario/[id]', () => {
  const { GET } = require('@/app/api/compras/inventario/[id]/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/inventario/abc'),
      { params: Promise.resolve({ id: 'abc' }) }
    )
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/compras/inventario/[id]', () => {
  const { PUT } = require('@/app/api/compras/inventario/[id]/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/inventario/abc', {
        method: 'PUT',
        body: JSON.stringify({ codigo: 'AL-I0001', descripcion: 'Test' }),
      }),
      { params: Promise.resolve({ id: 'abc' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 4. Inventario/search — debe permanecer público ───────────────────────────

describe('GET /api/compras/inventario/search (endpoint público)', () => {
  const { GET } = require('@/app/api/compras/inventario/search/route')

  it('responde sin requerir sesión', async () => {
    // anonClient devuelve cadena con datos vacíos
    const chain = mockChainVacio()
    chain.or    = jest.fn(() => chain)
    chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)

    const res = await GET(
      makeRequest('http://localhost/api/compras/inventario/search?q=valvula')
    )
    // 200 (array vacío) — nunca 401
    expect(res.status).toBe(200)
    expect(res.status).not.toBe(401)
  })
})

// ── 5. Inventario/next-codigo ─────────────────────────────────────────────────

describe('GET /api/compras/inventario/next-codigo', () => {
  const { GET } = require('@/app/api/compras/inventario/next-codigo/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/inventario/next-codigo'))
    expect(res.status).toBe(401)
  })
})

// ── 6. Proveedores ────────────────────────────────────────────────────────────

describe('GET /api/compras/proveedores', () => {
  const { GET } = require('@/app/api/compras/proveedores/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/proveedores'))
    expect(res.status).toBe(401)
  })

  it('devuelve 200 con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/proveedores'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/compras/proveedores', () => {
  const { POST } = require('@/app/api/compras/proveedores/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/proveedores', {
        method: 'POST',
        body: JSON.stringify({ nombre: 'Proveedor Test' }),
      })
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /api/compras/proveedores/[id]', () => {
  const { GET } = require('@/app/api/compras/proveedores/[id]/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/proveedores/abc'),
      { params: Promise.resolve({ id: 'abc' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 7. Creación de NP ─────────────────────────────────────────────────────────

describe('POST /api/compras/nps', () => {
  const { POST } = require('@/app/api/compras/nps/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps', {
        method: 'POST',
        body: JSON.stringify({ encabezado: {}, items: [] }),
      })
    )
    expect(res.status).toBe(401)
  })
})

// ── 8. Importación masiva de inventario ──────────────────────────────────────

describe('POST /api/compras/inventario/importar', () => {
  const { POST } = require('@/app/api/compras/inventario/importar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const fd = new FormData()
    const res = await POST(
      makeRequest('http://localhost/api/compras/inventario/importar', {
        method: 'POST',
        body: fd,
      })
    )
    expect(res.status).toBe(401)
  })
})

// ── 9. Separación de tokens: devolver usa token_devolucion ───────────────────

describe('POST /api/devolver/[token] — separación de tokens', () => {
  const { POST } = require('@/app/api/devolver/[token]/route')

  it('rechaza si el token coincide con token_aprobacion en vez de token_devolucion', async () => {
    // Simulamos que la NP existe por token_aprobacion pero NO por token_devolucion
    const chain = mockChainVacio()
    chain.eq = jest.fn((campo: string) => {
      if (campo === 'token_devolucion') {
        // No encontrada — el token es de aprobación, no de devolución
        chain.single = jest.fn(() => Promise.resolve({ data: null, error: { message: 'Not found' } }))
      }
      return chain
    })
    mockFrom.mockReturnValue(chain)

    const res = await POST(
      makeRequest('http://localhost/api/devolver/token-de-aprobacion', {
        method: 'POST',
        body: JSON.stringify({ motivo_devolucion: 'Falta descripción' }),
      }),
      { params: Promise.resolve({ token: 'token-de-aprobacion' }) }
    )
    expect(res.status).toBe(404)
  })

  it('verifica que la búsqueda usa el campo token_devolucion', async () => {
    const campoBuscado: string[] = []
    const chain = mockChainVacio()
    chain.eq = jest.fn((campo: string) => {
      campoBuscado.push(campo)
      chain.single = jest.fn(() => Promise.resolve({ data: null, error: { message: 'Not found' } }))
      return chain
    })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/devolver/cualquier-token', {
        method: 'POST',
        body: JSON.stringify({ motivo_devolucion: 'Corrección requerida' }),
      }),
      { params: Promise.resolve({ token: 'cualquier-token' }) }
    )

    expect(campoBuscado).toContain('token_devolucion')
    expect(campoBuscado).not.toContain('token_aprobacion')
  })
})
