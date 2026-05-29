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

  it('devuelve 403 cuando el rol no puede crear proveedores (solicitante)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'solicitante', nombre: 'Test', email: 'test@test.com' }, error: null })
    )
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/proveedores', {
        method: 'POST',
        body: JSON.stringify({ nombre: 'Proveedor Test' }),
      })
    )
    expect(res.status).toBe(403)
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

// ── 9. Cambio de contraseña ───────────────────────────────────────────────────

describe('POST /api/auth/cambiar-password', () => {
  const { POST } = require('@/app/api/auth/cambiar-password/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/auth/cambiar-password', {
        method: 'POST',
        body: JSON.stringify({
          passwordActual:  'Actual123',
          passwordNuevo:   'Nuevo456A',
          passwordConfirm: 'Nuevo456A',
        }),
      })
    )
    expect(res.status).toBe(401)
  })
})

// ── 11. Asistentes — solo compras/admin ──────────────────────────────────────

describe('GET /api/compras/asistentes', () => {
  const { GET } = require('@/app/api/compras/asistentes/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/asistentes'))
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el rol no es compras ni admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/asistentes'))
    expect(res.status).toBe(403)
  })

  it('devuelve 200 con rol compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    // Primera llamada: perfil → rol compras
    // Segunda llamada: lista asistentes → []
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras' }, error: null }))
    chain.order  = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/asistentes'))
    expect(res.status).toBe(200)
  })
})

// ── 12. Asignar NP — solo compras/admin ──────────────────────────────────────

describe('POST /api/compras/nps/[id]/asignar', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/asignar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'user-abc' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el rol no es compras ni admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'user-abc' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(403)
  })
})

// ── 13. Lista y creación de OCs — ambas protegidas ───────────────────────────

describe('GET /api/compras/ordenes', () => {
  const { GET } = require('@/app/api/compras/ordenes/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/ordenes'))
    expect(res.status).toBe(401)
  })

  it('devuelve 200 con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/ordenes'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/compras/ordenes', () => {
  const { POST } = require('@/app/api/compras/ordenes/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes', {
        method: 'POST',
        body: JSON.stringify({ proveedor: 'Test', items: [{ descripcion: 'X', unidad: 'EA', cantidad: 1, precio_unitario: 10 }] }),
      })
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el rol no puede crear OCs', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante', nombre: 'Test' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes', {
        method: 'POST',
        body: JSON.stringify({ proveedor: 'Test', items: [{ descripcion: 'X', unidad: 'EA', cantidad: 1, precio_unitario: 10 }] }),
      })
    )
    expect(res.status).toBe(403)
  })
})

// ── 14. Completar NP ─────────────────────────────────────────────────────────

describe('POST /api/compras/nps/[id]/completar', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/completar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/completar', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 14. Exportar ítems NP ────────────────────────────────────────────────────

describe('GET /api/compras/nps/[id]/exportar', () => {
  const { GET } = require('@/app/api/compras/nps/[id]/exportar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/nps/np-123/exportar'),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 15. Enviar OC a aprobación ───────────────────────────────────────────────

describe('POST /api/compras/ordenes/[id]/enviar-aprobacion', () => {
  const { POST } = require('@/app/api/compras/ordenes/[id]/enviar-aprobacion/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/enviar-aprobacion', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el rol no tiene permiso', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante', nombre: 'Test', email: 'test@test.com' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/enviar-aprobacion', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(403)
  })
})

// ── 16. Aprobar / Rechazar OC ─────────────────────────────────────────────────

describe('POST /api/compras/ordenes/[id]/aprobar', () => {
  const { POST } = require('@/app/api/compras/ordenes/[id]/aprobar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/aprobar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'aprobar' }),
      }),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 400 con acción inválida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras', nombre: 'Test', email: 'test@test.com' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/aprobar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'invalida' }),
      }),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(400)
  })
})

// ── 10. Separación de tokens: devolver usa token_devolucion ──────────────────

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

// ── 17. Configuración de empresa ─────────────────────────────────────────────

describe('GET /api/compras/configuracion/empresa', () => {
  const { GET } = require('@/app/api/compras/configuracion/empresa/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/configuracion/empresa'))
    expect(res.status).toBe(401)
  })

  it('pasa el check de auth con sesión válida', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    // Devuelve null → 404, pero nunca 401
    chain.single = jest.fn(() => Promise.resolve({ data: null, error: { message: 'Not found' } }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/configuracion/empresa'))
    expect(res.status).not.toBe(401)
  })
})

describe('PUT /api/compras/configuracion/empresa', () => {
  const { PUT } = require('@/app/api/compras/configuracion/empresa/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/configuracion/empresa', {
        method: 'PUT',
        body: JSON.stringify({ razon_social: 'ARLIFT S.A.' }),
      })
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el rol no es admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'compras' }, error: null })
    )
    mockFrom.mockReturnValue(chain)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/configuracion/empresa', {
        method: 'PUT',
        body: JSON.stringify({ razon_social: 'ARLIFT S.A.' }),
      })
    )
    expect(res.status).toBe(403)
  })
})

// ── 18. Editar NP rechazada (PUT) ────────────────────────────────────────────

describe('PUT /api/compras/nps/[id]', () => {
  const { PUT } = require('@/app/api/compras/nps/[id]/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/nps/np-123', {
        method: 'PUT',
        body: JSON.stringify({ encabezado: {}, items: [] }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el usuario no es el creador ni compras/admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    // Primera llamada: perfil → rol solicitante con id distinto al creado_por_id
    chain.single = jest.fn()
      .mockResolvedValueOnce({ data: { rol: 'solicitante', nombre: 'Test', email: 'test@test.com' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'np-123', estado: 'rechazada', creado_por_id: 'otro-user-id', motivo_rechazo: 'falta info' }, error: null })
    mockFrom.mockReturnValue(chain)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/nps/np-123', {
        method: 'PUT',
        body: JSON.stringify({ encabezado: { area: 'TI' }, items: [{ descripcion: 'X', unidad: 'EA', cantidad: 1, precio_unitario: 10 }] }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(403)
  })
})

// ── 19. Reabrir NP ───────────────────────────────────────────────────────────

describe('POST /api/compras/nps/[id]/reabrir', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/reabrir/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/reabrir', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 para rol solicitante', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante', nombre: 'Test', email: 'test@test.com' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/reabrir', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(403)
  })
})

// ── 20. Gestión de usuarios — GET lista y DELETE ──────────────────────────────

describe('GET /api/admin/usuarios', () => {
  const { GET } = require('@/app/api/admin/usuarios/route')

  it('devuelve 403 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/admin/usuarios'))
    expect(res.status).toBe(403)
  })

  it('devuelve 200 con rol compras (antes denegado)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras' }, error: null }))
    chain.order  = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/admin/usuarios'))
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/usuarios/[id]', () => {
  const { DELETE } = require('@/app/api/admin/usuarios/[id]/route')

  it('devuelve 403 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await DELETE(
      makeRequest('http://localhost/api/admin/usuarios/user-456'),
      { params: Promise.resolve({ id: 'user-456' }) }
    )
    expect(res.status).toBe(403)
  })

  it('devuelve 403 cuando el rol no es admin ni compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await DELETE(
      makeRequest('http://localhost/api/admin/usuarios/user-456'),
      { params: Promise.resolve({ id: 'user-456' }) }
    )
    expect(res.status).toBe(403)
  })

  it('devuelve 403 al intentar eliminar la propia cuenta', async () => {
    // CON_SESION.user.id = 'user-123' — mismo id en params → auto-eliminación
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'admin' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await DELETE(
      makeRequest('http://localhost/api/admin/usuarios/user-123'),
      { params: Promise.resolve({ id: 'user-123' }) }
    )
    expect(res.status).toBe(403)
  })
})
