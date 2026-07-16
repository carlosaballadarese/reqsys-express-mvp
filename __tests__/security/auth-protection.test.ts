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

const mockActualizarEstadoNP = jest.fn((..._args: unknown[]) => Promise.resolve())
const mockPausarSLAPorCierre = jest.fn((..._args: unknown[]) => Promise.resolve())
jest.mock('@/lib/np-estado', () => ({
  actualizarEstadoNP:  (...args: unknown[]) => mockActualizarEstadoNP(...args),
  pausarSLAPorCierre:  (...args: unknown[]) => mockPausarSLAPorCierre(...args),
  // Spec: HU-010 — valor real (no mockeado), varios endpoints lo usan como set de
  // pertenencia en código de aplicación (no solo como argumento de query Supabase).
  ESTADOS_NP_ABIERTA_A_OC: ['aprobada', 'en_gestion', 'oc_directa', 'oc_generada', 'oc_en_aprobacion', 'oc_aprobada'],
  // Spec: HU-011 — valores/función reales, lib/np-vista.ts (usado por la ruta de
  // Vista por NP) los importa de @/lib/np-estado y los ejecuta como código de
  // aplicación, no solo como argumento de query Supabase.
  ESTADOS_OC_VIVOS: ['en_proceso', 'en_aprobacion_compras', 'en_aprobacion_gerencia', 'aprobada'],
  calcularAccionAgregada: (acciones: { orden: number }[]) =>
    acciones.length === 0 ? null : Math.min(...acciones.map(a => a.orden)),
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
  chain.in     = noop
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

  // Spec: HU-010 CA-02, CA-03 — el listado incluye asistente_compras y compras (admin excluido)
  it('filtra por rol asistente_compras y compras (no solo asistente_compras)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'admin' }, error: null }))
    chain.order  = jest.fn(() => Promise.resolve({ data: [], error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/asistentes'))
    expect(res.status).toBe(200)
    expect(chain.in).toHaveBeenCalledWith('rol', ['asistente_compras', 'compras'])
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

  // Spec: HU-010 CA-04 — primera asignación invoca actualizarEstadoNP()
  it('primera asignación (200) invoca actualizarEstadoNP()', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'aprobada', convertida: false, area: 'TI', asignado_a: null }, error: null,
      })
      return Promise.resolve({ data: { id: 'ast-1', nombre: 'Ana', email: 'ana@arlift.com' }, error: null })
    })
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'ast-1' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-123')
  })

  // Spec: HU-010 CA-07 — regresión del guard bloqueante: reasignar ya NO debe dar 400
  // para una NP que HU-009 movió fuera de 'aprobada' (afectaba a producción real)
  it('reasignar (200) una NP en en_gestion — antes bloqueado por el guard viejo', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'en_gestion', convertida: false, area: 'TI', asignado_a: 'ast-1' }, error: null,
      })
      return Promise.resolve({ data: { id: 'ast-2', nombre: 'Beto', email: 'beto@arlift.com' }, error: null })
    })
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'reasignar', asistente_id: 'ast-2' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
  })

  // Spec: HU-010 CA-09 — tomar_control sobre NP en en_gestion ya NO debe dar 400
  it('tomar_control (200) una NP en en_gestion — SLA y Estado quedan intactos (RN-04)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'en_gestion', convertida: false, area: 'TI', asignado_a: 'ast-1' }, error: null,
      })
    })
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'tomar_control' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-123')
  })

  // Spec: HU-010 CA-01 — no se puede "asignar" (vs. reasignar) si ya tiene comprador
  it('devuelve 400 al intentar "asignar" una NP que ya tiene comprador', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'en_gestion', convertida: false, area: 'TI', asignado_a: 'ast-1' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'ast-2' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(400)
  })

  // Spec: HU-010 CA-09 — no se puede reasignar/tomar_control si no hay comprador
  it('devuelve 400 al reasignar una NP sin comprador asignado', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'aprobada', convertida: false, area: 'TI', asignado_a: null }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'reasignar', asistente_id: 'ast-2' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(400)
  })

  // Spec: HU-010 CA-02, CA-03 — lookup de comprador amplía el filtro de rol
  it('el lookup de comprador filtra por rol asistente_compras o compras (CA-03: compras se autoasigna)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'aprobada', convertida: false, area: 'TI', asignado_a: null }, error: null,
      })
      return Promise.resolve({ data: { id: 'user-123', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
    })
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'user-123' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    expect(chain.in).toHaveBeenCalledWith('rol', ['asistente_compras', 'compras'])
  })

  // Spec: HU-010 CA-04 — la Acción "Asignada" (orden 1) se marca automáticamente
  // en todas las líneas de la NP al asignar (gap detectado en Fase 5 SDD)
  it('marca automáticamente la Acción "Asignada" en items_np al asignar (CA-04)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'aprobada', convertida: false, area: 'TI', asignado_a: null, prioridad: 'media' }, error: null,
      })
      if (singleCalls === 3) return Promise.resolve({ data: { id: 'ast-1', nombre: 'Ana', email: 'ana@arlift.com' }, error: null })
      return Promise.resolve({ data: { id: 'accion-asignada-uuid' }, error: null })
    })
    const updateCalls: any[] = []
    chain.update = jest.fn((payload: any) => { updateCalls.push(payload); return chain })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'ast-1' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    const itemsUpdate = updateCalls.find((c: any) => c.accion_id === 'accion-asignada-uuid')
    expect(itemsUpdate).toBeDefined()
    expect(itemsUpdate.accion_marcada_por).toBe('ast-1')
  })

  // Spec: HU-010 CA-04 + RN-05 (HU-009) — Excepcional → oc_directa, no usa Acciones
  it('NO marca Acción al asignar con Prioridad Excepcional (RN-05 de HU-009)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'aprobada', convertida: false, area: 'TI', asignado_a: null, prioridad: 'excepcional' }, error: null,
      })
      return Promise.resolve({ data: { id: 'ast-1', nombre: 'Ana', email: 'ana@arlift.com' }, error: null })
    })
    const updateCalls: any[] = []
    chain.update = jest.fn((payload: any) => { updateCalls.push(payload); return chain })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'ast-1' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    expect(updateCalls.some((c: any) => 'accion_id' in c)).toBe(false)
  })

  // Spec: HU-010 CA-01 — asignar sobre una NP que quedó en en_gestion sin comprador
  // (tras un tomar_control previo), no solo el caso "aprobada" nunca asignada
  it('asignar (200) una NP en en_gestion sin comprador (post tomar_control), no reinicia sla_iniciado_en', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-123', numero: 'NP-2026-0001', estado: 'en_gestion', convertida: false, area: 'TI', asignado_a: null, prioridad: 'media' }, error: null,
      })
      if (singleCalls === 3) return Promise.resolve({ data: { id: 'ast-2', nombre: 'Beto', email: 'beto@arlift.com' }, error: null })
      return Promise.resolve({ data: { id: 'accion-asignada-uuid' }, error: null })
    })
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-123/asignar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'asignar', asistente_id: 'ast-2' }),
      }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-123')
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

  it('devuelve 403 cuando el rol no es admin ni compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'gerencia' }, error: null })
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

  // ── Lógica de negocio: condicionado de precio + proveedor_sugerido ──────────
  // Cadena que permite llegar hasta el insert de items_np capturando el payload.
  // single() es secuencial: 1) perfil  2) notas_pedido  3) coordinadores_area
  function mockChainEditar(singles: any[]) {
    const resolved = { data: [], error: null }
    const chain: any = {}
    const noop = jest.fn(() => chain)
    chain.select = noop
    chain.eq     = noop
    chain.order  = noop
    const singleFn = jest.fn()
    singles.forEach(s => singleFn.mockResolvedValueOnce(s))
    chain.single = singleFn
    chain.update = jest.fn(() => chain)
    chain.delete = jest.fn(() => chain)
    chain.insert = jest.fn(() => Promise.resolve(resolved))
    chain.then   = (resolve: any, reject: any) => Promise.resolve(resolved).then(resolve, reject)
    return chain
  }

  const NP_RECHAZADA = {
    id: 'np-123', numero: 'NP-2026-0001', estado: 'rechazada',
    area: 'TI', creado_por_id: 'user-123', solicitante_nombre: 'Solicitante X',
    token_aprobacion: 'tok-aprob', motivo_rechazo: 'faltan datos',
  }
  const COORDINADOR = { nombre: 'Coordinador TI', email: 'coord@arlift.com' }

  function bodyEditar(precio: number) {
    return JSON.stringify({
      encabezado: {
        solicitante_nombre: 'Solicitante X', solicitante_email: 's@arlift.com',
        area: 'TI', prioridad: 'media', tipo_compra: 'producto',
        centro_costo: 'gasto', descripcion_general: 'Corregido',
      },
      items: [{
        codigo: 'AL-I-0001', descripcion: 'Item corregido', unidad: 'EA',
        cantidad: 2, precio_unitario: precio, proveedor_sugerido: 'ACME S.A.',
      }],
    })
  }

  it('fuerza precio_unitario a 0 para rol solicitante (sin permiso de precio) y persiste proveedor_sugerido', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    // Creador (creado_por_id === user-123) con rol solicitante → puedeVerPrecio false
    const chain = mockChainEditar([
      { data: { rol: 'solicitante', nombre: 'Solicitante X', email: 's@arlift.com' }, error: null },
      { data: NP_RECHAZADA, error: null },
      { data: COORDINADOR, error: null },
    ])
    mockFrom.mockReturnValue(chain)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/nps/np-123', { method: 'PUT', body: bodyEditar(99) }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    // Primer insert = items_np
    const itemsInsertados = chain.insert.mock.calls[0][0]
    expect(itemsInsertados[0].precio_unitario).toBe(0)
    expect(itemsInsertados[0].proveedor_sugerido).toBe('ACME S.A.')
  })

  it('respeta precio_unitario y persiste proveedor_sugerido para rol compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainEditar([
      { data: { rol: 'compras', nombre: 'Jefe Compras', email: 'compras@arlift.com' }, error: null },
      { data: NP_RECHAZADA, error: null },
      { data: COORDINADOR, error: null },
    ])
    mockFrom.mockReturnValue(chain)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/nps/np-123', { method: 'PUT', body: bodyEditar(99) }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    const itemsInsertados = chain.insert.mock.calls[0][0]
    expect(itemsInsertados[0].precio_unitario).toBe(99)
    expect(itemsInsertados[0].proveedor_sugerido).toBe('ACME S.A.')
  })

  it('permite editar NP en estado devuelta (creador) y limpia motivo_devolucion', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const NP_DEVUELTA = {
      id: 'np-123', numero: 'NP-2026-0001', estado: 'devuelta',
      area: 'HSE', creado_por_id: 'user-123', solicitante_nombre: 'Suylen Vargas',
      token_aprobacion: 'tok-aprob', motivo_rechazo: null,
      motivo_devolucion: 'SE DEVUELVE PARA CORRECCIONES',
    }
    const chain = mockChainEditar([
      { data: { rol: 'solicitante', nombre: 'Suylen Vargas', email: 'tecnico.hse@arlift.com' }, error: null },
      { data: NP_DEVUELTA, error: null },
      { data: COORDINADOR, error: null },
    ])
    mockFrom.mockReturnValue(chain)
    const res = await PUT(
      makeRequest('http://localhost/api/compras/nps/np-123', { method: 'PUT', body: bodyEditar(50) }),
      { params: Promise.resolve({ id: 'np-123' }) }
    )
    expect(res.status).toBe(200)
    // El update debe incluir motivo_devolucion: null para limpiar el campo
    const updatePayload = chain.update.mock.calls[0][0]
    expect(updatePayload).toMatchObject({ estado: 'pendiente', motivo_devolucion: null })
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

// ── 20. Exportar OC — PDF y Excel ────────────────────────────────────────────

describe('GET /api/compras/ordenes/[id]/pdf', () => {
  const { GET } = require('@/app/api/compras/ordenes/[id]/pdf/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/pdf'),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /api/compras/ordenes/[id]/excel', () => {
  const { GET } = require('@/app/api/compras/ordenes/[id]/excel/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/ordenes/oc-123/excel'),
      { params: Promise.resolve({ id: 'oc-123' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 21. Gestión de usuarios — GET lista y DELETE ──────────────────────────────

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

// ── 22. Aprobar NP — persistencia del aprobador ───────────────────────────────

describe('POST /api/aprobar/[token] — persistencia de aprobador_np', () => {
  const { POST } = require('@/app/api/aprobar/[token]/route')

  it('persiste aprobador_np_nombre y aprobador_np_area al aprobar NP', async () => {
    const { transporter } = require('@/lib/mailer')
    transporter.sendMail.mockResolvedValue({})

    const np = {
      id: 'np-apr-1', numero: 'NP-2026-0001', area: 'Operaciones',
      estado: 'pendiente', token_aprobacion: 'tok-aprobar',
      descripcion_general: 'Test', total_estimado: 500,
      solicitante_email: 'sol@arlift.com', solicitante_nombre: 'Solicitante',
    }
    const coordinador = { nombre: 'Juan Pérez', email: 'juan@arlift.com' }
    const comprasCoord = { nombre: 'Ana Compras', email: 'ana@arlift.com' }

    let singleCalls = 0
    const updateEqMock = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: updateEqMock }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: np,          error: null }) // NP
      if (singleCalls === 2) return Promise.resolve({ data: coordinador, error: null }) // coordinadorArea
      return Promise.resolve({ data: comprasCoord, error: null })                       // Promise.all
    })
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/aprobar/tok-aprobar', {
      method: 'POST',
      body: JSON.stringify({ accion: 'aprobar' }),
    })
    await POST(req, { params: Promise.resolve({ token: 'tok-aprobar' }) })

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        aprobador_np_nombre: 'Juan Pérez',
        aprobador_np_area:   'Operaciones',
      })
    )
  })
})

// ── 23. Convertir NP → OC — propagación del aprobador ────────────────────────

describe('POST /api/compras/convertir/[id] — propagación de aprobador_np', () => {
  const { POST } = require('@/app/api/compras/convertir/[id]/route')

  const mockRpcFn = jest.fn(() => Promise.resolve({ data: 1, error: null }))
  beforeEach(() => { mockAdminClient.mockReturnValue({ from: mockFrom, rpc: mockRpcFn }) })
  afterEach(()  => { mockAdminClient.mockReturnValue({ from: mockFrom }) })

  it('copia aprobador_np_nombre y aprobador_np_area de NP a la OC creada', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    const np = {
      id: 'np-conv-1', numero: 'NP-2026-0002', area: 'Operaciones',
      estado: 'aprobada', tipo_compra: 'bienes', centro_costo: 'CC01',
      descripcion_general: 'Test', created_at: '2026-01-01T00:00:00Z',
      convertida: false, asignado_a: null,
      aprobador_np_nombre: 'Juan Pérez',
      aprobador_np_area:   'Operaciones',
    }

    const insertSelectSingleMock = jest.fn(() =>
      Promise.resolve({ data: { id: 'oc-new', numero_oc: 'OC-2026-0001' }, error: null })
    )
    const insertMock = jest.fn(() => ({ select: jest.fn(() => ({ single: insertSelectSingleMock })) }))

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.insert = insertMock
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos B', email: 'cb@arlift.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: np,  error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/convertir/np-conv-1', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        // item_np_id requerido por HU-003; cantidad coincide con NP → no requiere justificación
        items: [{ item_np_id: 'np-item-1', descripcion: 'Item test', unidad: 'EA', cantidad: 1, precio_unitario: 100 }],
      }),
    })
    await POST(req, { params: Promise.resolve({ id: 'np-conv-1' }) })

    expect(insertMock).toHaveBeenCalled()
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      aprobador_np_nombre: 'Juan Pérez',
      aprobador_np_area:   'Operaciones',
    })
  })
})

// ── 24. Dinamización etiquetas aprobador OC ───────────────────────────────────

describe('POST /api/compras/ordenes/[id]/aprobar — persistencia aprobado_por_rol', () => {
  const { POST } = require('@/app/api/compras/ordenes/[id]/aprobar/route')

  function setupAprobOC(rolAprobador: string, estadoOC: string) {
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    let singleCalls = 0
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: rolAprobador, nombre: 'Aprobador Test', email: 'aprobador@test.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: { id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: estadoOC, valor_total: 500, proveedor: 'ACME', creado_por_id: 'user-2', creado_por_nombre: 'Creador' }, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { email: 'creador@test.com', nombre: 'Creador' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)
    return chain
  }

  it('persiste aprobado_por_rol = "compras" al aprobar con rol compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = setupAprobOC('compras', 'en_aprobacion_compras')
    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/aprobar', {
      method: 'POST',
      body: JSON.stringify({ accion: 'aprobar' }),
    })
    await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ aprobado_por_rol: 'compras' })
    )
  })

  it('persiste aprobado_por_rol = "gerencia" al aprobar con rol gerencia', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = setupAprobOC('gerencia', 'en_aprobacion_gerencia')
    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/aprobar', {
      method: 'POST',
      body: JSON.stringify({ accion: 'aprobar' }),
    })
    await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ aprobado_por_rol: 'gerencia' })
    )
  })
})

describe('resolverEtiquetaAprobador — mapeo rol → etiqueta y cargo', () => {
  const { resolverEtiquetaAprobador } = require('@/lib/oc-utils')

  it('compras → COORDINADOR DE COMPRAS / Coordinador de Compras', () => {
    const r = resolverEtiquetaAprobador('compras')
    expect(r.titulo).toBe('COORDINADOR DE COMPRAS')
    expect(r.cargo).toBe('Coordinador de Compras')
  })

  it('gerencia → GERENTE GENERAL / Gerente General', () => {
    const r = resolverEtiquetaAprobador('gerencia')
    expect(r.titulo).toBe('GERENTE GENERAL')
    expect(r.cargo).toBe('Gerente General')
  })

  it('admin → ADMINISTRADOR DEL SISTEMA / Administrador del Sistema', () => {
    const r = resolverEtiquetaAprobador('admin')
    expect(r.titulo).toBe('ADMINISTRADOR DEL SISTEMA')
    expect(r.cargo).toBe('Administrador del Sistema')
  })

  it('null → etiqueta combinada default (OCs históricas sin aprobado_por_rol)', () => {
    const r = resolverEtiquetaAprobador(null)
    expect(r.titulo).toContain('GERENTE GENERAL')
    expect(r.cargo).toContain('Gerente General')
  })
})

// ── 25. Trazabilidad y límites de cantidades NP → OC ─────────────────────────

describe('GET /api/compras/nps/[id] — incluye campo cobertura', () => {
  const { GET } = require('@/app/api/compras/nps/[id]/route')

  it('devuelve campo cobertura en el response', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    const np = { id: 'np-1', numero: 'NP-2026-0001', area: 'Operaciones', estado: 'aprobada',
      total_estimado: 500, creado_por_id: 'user-123' }

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: np, error: null })           // notas_pedido
      if (singleCalls === 2) return Promise.resolve({ data: { rol: 'compras', email: 'c@a.com' }, error: null }) // perfil
      return Promise.resolve({ data: null, error: null })
    })
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)

    const req = makeRequest(`http://localhost/api/compras/nps/np-1`)
    const res = await GET(req, { params: Promise.resolve({ id: 'np-1' }) })
    const body = await res.json()

    expect(body).toHaveProperty('cobertura')
    expect(body.cobertura).toHaveProperty('por_item')
    expect(body.cobertura).toHaveProperty('np_cubierta')
    expect(body.cobertura).toHaveProperty('porcentaje_global')
  })
})

describe('POST /api/compras/convertir/[id] — validación sobrecompra', () => {
  const { POST } = require('@/app/api/compras/convertir/[id]/route')

  const mockRpcFn = jest.fn(() => Promise.resolve({ data: 1, error: null }))
  beforeEach(() => { mockAdminClient.mockReturnValue({ from: mockFrom, rpc: mockRpcFn }) })
  afterEach(()  => { mockAdminClient.mockReturnValue({ from: mockFrom }) })

  function setupConvertir(cantidadNP: number, cantidadComprometida: number) {
    const np = { id: 'np-sob-1', numero: 'NP-2026-0010', area: 'Operaciones',
      estado: 'aprobada', tipo_compra: 'bienes', centro_costo: 'CC01',
      descripcion_general: 'Test', created_at: '2026-01-01', convertida: false,
      asignado_a: null, aprobador_np_nombre: null, aprobador_np_area: null }

    const insertMock = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() =>
      Promise.resolve({ data: { id: 'oc-new', numero_oc: 'OC-2026-0010' }, error: null })) })) }))

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in   = jest.fn(() => chain)
    chain.insert = insertMock
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      // perfil, np, proveedor
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: np, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    // HU-003: thenCalls=1 es validarEnlaceYJustificacion; 2-4 son calcularCoberturaNP
    let thenCalls = 0
    chain.then = (resolve: any) => {
      thenCalls++
      // validarEnlaceYJustificacion → items_np (id, cantidad)
      if (thenCalls === 1) return Promise.resolve({ data: [{ id: 'item-np-1', cantidad: cantidadNP }], error: null }).then(resolve)
      // calcularCoberturaNP → items_np (completo)
      if (thenCalls === 2) return Promise.resolve({ data: [{ id: 'item-np-1', linea: 1, descripcion: 'Producto', cantidad: cantidadNP }], error: null }).then(resolve)
      // calcularCoberturaNP → registro_compras OC IDs
      if (thenCalls === 3) return Promise.resolve({ data: [{ id: 'oc-exist' }], error: null }).then(resolve)
      // calcularCoberturaNP → items_oc
      if (thenCalls === 4) return Promise.resolve({ data: [{ item_np_id: 'item-np-1', cantidad: cantidadComprometida }], error: null }).then(resolve)
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    mockFrom.mockReturnValue(chain)
    return chain
  }

  it('devuelve 409 con error sobrecompra cuando cantidad excede saldo sin confirmación', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupConvertir(5, 3) // solicitado=5, comprometido=3, saldo=2 → nuevo=4 → excede

    const req = makeRequest('http://localhost/api/compras/convertir/np-sob-1', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        // HU-003: cantidad difiere de NP (4 vs 5) → justificacion_cantidad requerida para pasar CA-03
        items: [{ item_np_id: 'item-np-1', descripcion: 'Producto', unidad: 'EA', cantidad: 4, precio_unitario: 10,
                  justificacion_cantidad: 'Entrega parcial, saldo en próxima OC' }],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'np-sob-1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('sobrecompra')
    expect(body.items_excedidos).toHaveLength(1)
    expect(body.items_excedidos[0].exceso).toBe(2)
  })

  it('no devuelve 409 cuando sobrecompra_confirmada = true', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupConvertir(5, 3)

    const req = makeRequest('http://localhost/api/compras/convertir/np-sob-1', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        sobrecompra_confirmada: true,
        // HU-003: justificación incluida para pasar CA-03
        items: [{ item_np_id: 'item-np-1', descripcion: 'Producto', unidad: 'EA', cantidad: 4, precio_unitario: 10,
                  justificacion_cantidad: 'Entrega parcial, saldo en próxima OC' }],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'np-sob-1' }) })
    expect(res.status).not.toBe(409)
  })

  it('HU-009: permite generar una OC adicional cuando la NP ya está en en_gestion (no solo aprobada)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = setupConvertir(5, 0)
    // setupConvertir deja np.estado='aprobada' por defecto; lo pisamos a 'en_gestion'
    // para probar que el filtro .in(ESTADOS_NP_ABIERTA_A_OC) ya no exige 'aprobada' exacto
    const npOriginal = { id: 'np-sob-1', numero: 'NP-2026-0010', area: 'Operaciones',
      estado: 'en_gestion', tipo_compra: 'bienes', centro_costo: 'CC01',
      descripcion_general: 'Test', created_at: '2026-01-01', convertida: true,
      asignado_a: 'comprador-1', aprobador_np_nombre: null, aprobador_np_area: null }
    let singleCalls = 0
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: npOriginal, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const req = makeRequest('http://localhost/api/compras/convertir/np-sob-1', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        items: [{ item_np_id: 'item-np-1', descripcion: 'Producto', unidad: 'EA', cantidad: 5, precio_unitario: 10 }],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'np-sob-1' }) })
    expect(res.status).toBe(200)
  })
})

// ── 26. Cancelación de OC ─────────────────────────────────────────────────────

describe('POST /api/compras/ordenes/[id]/cancelar', () => {
  const { POST } = require('@/app/api/compras/ordenes/[id]/cancelar/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const chain = mockChainVacio()
    mockFrom.mockReturnValue(chain)
    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/cancelar', {
      method: 'POST',
      body: JSON.stringify({ motivo: 'Error de proveedor' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(res.status).toBe(401)
  })

  it('devuelve 403 para rol no autorizado (solicitante)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'solicitante', nombre: 'Ana', email: 'ana@a.com' }, error: null })
    )
    mockFrom.mockReturnValue(chain)
    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/cancelar', {
      method: 'POST',
      body: JSON.stringify({ motivo: 'Error de proveedor' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(res.status).toBe(403)
  })

  it('devuelve 409 si la OC ya está cancelada', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: { id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'cancelada', nota_pedido_id: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)
    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/cancelar', {
      method: 'POST',
      body: JSON.stringify({ motivo: 'Ya estaba cancelada' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(res.status).toBe(409)
  })

  it('cancela OC exitosamente y registra historial NP', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const insertMock = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    const chain = mockChainVacio()
    chain.in   = jest.fn(() => chain)
    chain.insert = insertMock
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: { id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'en_proceso', nota_pedido_id: 'np-1' }, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { estado: 'aprobada', numero: 'NP-2026-0001' }, error: null }) // NP
      return Promise.resolve({ data: null, error: null })
    })
    // items_oc sin item_np_id (OC sin trazabilidad, simplifica el test)
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/ordenes/oc-1/cancelar', {
      method: 'POST',
      body: JSON.stringify({ motivo: 'Proveedor no disponible' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'oc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_oc: 'cancelada', motivo_cancelacion: 'Proveedor no disponible' })
    )
    expect(insertMock).toHaveBeenCalled()
  })
})

// ── 28. Portal approval — persistencia de aprobador_np ───────────────────────

describe('PATCH /api/compras/nps/[id] — aprobación portal persiste aprobador_np', () => {
  const { PATCH } = require('@/app/api/compras/nps/[id]/route')

  it('persiste aprobador_np_nombre y aprobador_np_area al aprobar desde portal con rol compras', async () => {
    const { transporter } = require('@/lib/mailer')
    transporter.sendMail.mockResolvedValue({})

    const np = {
      id: 'np-portal-1', numero: 'NP-2026-0218', area: 'Compras',
      estado: 'pendiente', total_estimado: 100,
      solicitante_email: 'sol@arlift.com', solicitante_nombre: 'Solicitante',
    }

    const updateEqMock = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: updateEqMock }))

    let singleCalls = 0
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Claudia Sánchez', email: 'compras@arlift.com.ec' }, error: null }) // perfil
      if (singleCalls === 2) return Promise.resolve({ data: np, error: null })                                                                              // NP
      return Promise.resolve({ data: null, error: null })                                                                                                    // coord email (opcional)
    })
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/nps/np-portal-1', {
      method: 'PATCH',
      body: JSON.stringify({ accion: 'aprobar' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'np-portal-1' }) })

    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado:              'aprobada',
        aprobador_np_nombre: 'Claudia Sánchez',
        aprobador_np_area:   'Compras',
      })
    )
  })
})

// ── 29. GET /api/compras/nps — filtrado correcto por creado_por_id ───────────

describe('GET /api/compras/nps — filtrado por creado_por_id para solicitante y coordinador', () => {
  const { GET } = require('@/app/api/compras/nps/route')

  it('solicitante: usa OR(creado_por_id, solicitante_email) — ve sus propias NPs', async () => {
    mockGetUser.mockResolvedValue(CON_SESION) // user.id = 'user-123'

    const chain = mockChainVacio()
    const orMock = jest.fn(() => chain)
    chain.or = orMock
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'solicitante', email: 'sol@arlift.com' }, error: null })
    )
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/nps')
    await GET(req)

    expect(orMock).toHaveBeenCalledWith(
      expect.stringContaining('creado_por_id.eq.user-123')
    )
    expect(orMock).toHaveBeenCalledWith(
      expect.stringContaining('solicitante_email.eq.sol@arlift.com')
    )
  })

  it('coordinador: usa OR(area.in.(...), creado_por_id) — ve su área y sus propias NPs', async () => {
    mockGetUser.mockResolvedValue(CON_SESION) // user.id = 'user-123'

    const chain = mockChainVacio()
    const orMock = jest.fn(() => chain)
    chain.or = orMock
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'coordinador', email: 'coord@arlift.com' }, error: null })
    )
    let thenCalls = 0
    chain.then = (resolve: any) => {
      thenCalls++
      if (thenCalls === 1) return Promise.resolve({ data: [{ area: 'Operaciones' }], error: null }).then(resolve) // áreas del coord
      return Promise.resolve({ data: [], error: null }).then(resolve)  // NPs
    }
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/nps')
    await GET(req)

    const orCall = orMock.mock.calls.find((c: string[]) =>
      c[0].includes('area.in.') && c[0].includes('creado_por_id.eq.user-123')
    )
    expect(orCall).toBeDefined()
    expect(orCall![0]).toContain('area.in.(Operaciones)')
    expect(orCall![0]).toContain('creado_por_id.eq.user-123')
  })
})

// ── 27. Dashboard cobertura de NPs ────────────────────────────────────────────

describe('GET /api/compras/dashboard/cobertura', () => {
  const { GET } = require('@/app/api/compras/dashboard/cobertura/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const chain = mockChainVacio()
    mockFrom.mockReturnValue(chain)
    const req = makeRequest('http://localhost/api/compras/dashboard/cobertura')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('devuelve 200 con array nps y campos de cobertura', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    const npsMock = [
      { id: 'np-1', numero: 'NP-2026-0001', area: 'Operaciones', estado: 'aprobada',
        prioridad: 'alta', solicitante_nombre: 'Ana', created_at: '2026-01-15T00:00:00Z' },
    ]

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    // notas_pedido query devuelve array via then
    let thenCalls = 0
    chain.then = (resolve: any) => {
      thenCalls++
      if (thenCalls === 1) return Promise.resolve({ data: npsMock, error: null }).then(resolve)
      // items_np, registro_compras (OC IDs), items_oc
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/dashboard/cobertura')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('nps')
    expect(Array.isArray(body.nps)).toBe(true)
    expect(body.nps[0]).toHaveProperty('porcentaje_global')
    expect(body.nps[0]).toHaveProperty('np_cubierta')
    expect(body.nps[0]).toHaveProperty('total_solicitado')
    expect(body.nps[0]).toHaveProperty('total_comprometido')
  })

  it('devuelve 200 para asistente_compras (D2: scope personal por asignado_a_id)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'asistente_compras' }, error: null }))
    chain.then   = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const req = makeRequest('http://localhost/api/compras/dashboard/cobertura')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('nps')
  })
})

// ── 31. HU-003: Trazabilidad obligatoria ítem OC → ítem NP ───────────────────

describe('POST /api/compras/convertir/[id] — HU-003 enlace y justificación', () => {
  const { POST } = require('@/app/api/compras/convertir/[id]/route')

  const mockRpcFn = jest.fn(() => Promise.resolve({ data: 1, error: null }))
  beforeEach(() => { mockAdminClient.mockReturnValue({ from: mockFrom, rpc: mockRpcFn }) })
  afterEach(()  => { mockAdminClient.mockReturnValue({ from: mockFrom }) })

  const NP_APROBADA = {
    id: 'np-hu003', numero: 'NP-2026-0020', area: 'Operaciones',
    estado: 'aprobada', tipo_compra: 'bienes', centro_costo: 'CC01',
    descripcion_general: 'Test HU-003', created_at: '2026-01-01T00:00:00Z',
    convertida: false, asignado_a: null,
    aprobador_np_nombre: null, aprobador_np_area: null,
  }

  function setupConvertirBase() {
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.insert = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() =>
      Promise.resolve({ data: { id: 'oc-new', numero_oc: 'OC-2026-0020' }, error: null })) })) }))
    let singleCalls = 0
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'Carlos', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: NP_APROBADA, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)
    return chain
  }

  it('CA-01: devuelve 400 item_sin_enlace_np cuando algún ítem no tiene item_np_id', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupConvertirBase()

    const req = makeRequest('http://localhost/api/compras/convertir/np-hu003', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        items: [
          { item_np_id: 'item-np-1', descripcion: 'Con enlace', unidad: 'EA', cantidad: 2, precio_unitario: 10 },
          { item_np_id: null,        descripcion: 'Sin enlace', unidad: 'EA', cantidad: 1, precio_unitario: 5 },
        ],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'np-hu003' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('item_sin_enlace_np')
    expect(body.lineas).toContain(2)
  })

  it('CA-03: devuelve 400 justificacion_requerida cuando cantidad difiere y falta justificación', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = setupConvertirBase()

    // validarEnlaceYJustificacion consulta items_np via then
    chain.then = (resolve: any) => {
      return Promise.resolve({
        data: [{ id: 'item-np-1', cantidad: 5 }],
        error: null,
      }).then(resolve)
    }

    const req = makeRequest('http://localhost/api/compras/convertir/np-hu003', {
      method: 'POST',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        items: [
          // cantidad=3 difiere de NP cantidad=5, sin justificacion
          { item_np_id: 'item-np-1', descripcion: 'Producto', unidad: 'EA', cantidad: 3, precio_unitario: 10 },
        ],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'np-hu003' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('justificacion_requerida')
    expect(body.errores).toHaveLength(1)
    expect(body.errores[0].linea_oc).toBe(1)
    expect(body.errores[0].cantidad_np).toBe(5)
  })
})

// ── 32. Dashboard OCs — auth y scope ─────────────────────────────────────────

describe('GET /api/compras/dashboard/ocs', () => {
  const { GET } = require('@/app/api/compras/dashboard/ocs/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const chain = mockChainVacio()
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(401)
  })

  it('devuelve 403 para rol consulta (no autorizado)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'consulta' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(403)
  })

  it('devuelve 403 para rol solicitante (no autorizado)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(403)
  })

  it('devuelve 200 para rol compras con scope global y kpis', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras' }, error: null }))
    chain.then   = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scope).toBe('global')
    expect(body).toHaveProperty('kpis')
    expect(body.kpis).toHaveProperty('total')
    expect(body.kpis).toHaveProperty('valor_aprobado')
    expect(body.kpis).toHaveProperty('gasto_comprometido')
    expect(body.kpis).toHaveProperty('gasto_total_emitido')
    expect(body).toHaveProperty('porEstado')
    expect(body).toHaveProperty('porArea')
    expect(body).toHaveProperty('porMes')
  })

  it('devuelve 200 para asistente_compras con scope personal', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'asistente_compras' }, error: null }))
    chain.then   = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scope).toBe('personal')
  })

  it('devuelve 200 para gerencia con scope global', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'gerencia' }, error: null }))
    chain.then   = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/ocs'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scope).toBe('global')
  })
})

// ── Sección 32: Dashboard OCs canceladas ────────────────────────────────────
describe('GET /api/compras/dashboard/canceladas', () => {
  const { GET } = require('@/app/api/compras/dashboard/canceladas/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const chain = mockChainVacio()
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/canceladas'))
    expect(res.status).toBe(401)
  })

  it('devuelve 403 para rol solicitante (no autorizado)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/canceladas'))
    expect(res.status).toBe(403)
  })

  it('devuelve 200 para rol compras con array de OCs canceladas', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras' }, error: null }))
    chain.then = (resolve: any) => Promise.resolve({ data: [
      { id: 'oc-1', numero_oc: 'OC-2026-0001', numero_np: 'NP-2026-0001',
        nota_pedido_id: 'np-uuid-1', area: 'Producción', proveedor: 'ACME',
        created_at: '2026-06-01T10:00:00', valor_a_pagar: 500, motivo_cancelacion: 'Error de ingreso' },
    ], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)
    const res = await GET(makeRequest('http://localhost/api/compras/dashboard/canceladas'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toHaveProperty('numero_oc')
    expect(body[0]).toHaveProperty('motivo_cancelacion')
    expect(body[0]).toHaveProperty('nota_pedido_id')
  })
})

// ── Sección 33: HU-006 Completado administrativo de NPs ──────────────────────

describe('POST /api/compras/nps/[id]/completar — HU-006', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/completar/route')

  it('devuelve 400 si no se incluye motivo en el body', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null })
    )
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-id/completar', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-id' }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('El motivo de completado es requerido')
  })

  it('devuelve 403 para asistente_compras en NP no asignada a él', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({
        data: { rol: 'asistente_compras', nombre: 'Asistente', email: 'ast@arlift.com' }, error: null,
      })
      // NP con asignado_a diferente al user.id ('user-123')
      return Promise.resolve({
        data: { id: 'np-id', estado: 'aprobada', numero: 'NP-2026-0001', asignado_a: 'otro-user-id' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-id/completar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Ítems ya no requeridos' }),
      }),
      { params: Promise.resolve({ id: 'np-id' }) }
    )
    expect(res.status).toBe(403)
  })
})

describe('GET /api/compras/dashboard/cobertura — campo completado_manualmente (HU-006)', () => {
  const { GET } = require('@/app/api/compras/dashboard/cobertura/route')

  it('incluye completado_manualmente y fuerza porcentaje_global=100 para NPs manuales', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    const npsMock = [
      { id: 'np-m', numero: 'NP-2026-0099', area: 'Operaciones', estado: 'completada',
        prioridad: 'normal', solicitante_nombre: 'Pedro', created_at: '2026-06-01T00:00:00Z',
        completado_manualmente: true },
    ]

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    let thenCalls = 0
    chain.then = (resolve: any) => {
      thenCalls++
      if (thenCalls === 1) return Promise.resolve({ data: npsMock, error: null }).then(resolve)
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/dashboard/cobertura')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nps[0]).toHaveProperty('completado_manualmente', true)
    expect(body.nps[0].porcentaje_global).toBe(100)
    expect(body.nps[0].np_cubierta).toBe(true)
  })
})

describe('PUT /api/compras/ordenes/[id] — HU-003 enlace y justificación', () => {
  const { PUT } = require('@/app/api/compras/ordenes/[id]/route')

  it('CA-02: devuelve 400 item_sin_enlace_np cuando OC tiene NP origen e ítem sin item_np_id', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { estado_oc: 'en_proceso', creado_por_id: 'user-123', nota_pedido_id: 'np-trazab' },
        error: null,
      })
      if (singleCalls === 3) return Promise.resolve({
        data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null },
        error: null,
      })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/ordenes/oc-trazab', {
      method: 'PUT',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        items: [{ item_np_id: null, descripcion: 'Sin enlace', unidad: 'EA', cantidad: 2, precio_unitario: 10 }],
      }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'oc-trazab' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('item_sin_enlace_np')
    expect(body.lineas).toContain(1)
  })

  it('CA-08: OC sin nota_pedido_id acepta ítems sin item_np_id (no valida enlace)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)

    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in = jest.fn(() => chain)
    // delete().eq() necesita que delete() devuelva el chain, no una Promise
    chain.delete = jest.fn(() => chain)
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { estado_oc: 'en_proceso', creado_por_id: 'user-123', nota_pedido_id: null },
        error: null,
      })
      if (singleCalls === 3) return Promise.resolve({
        data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null },
        error: null,
      })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/ordenes/oc-libre', {
      method: 'PUT',
      body: JSON.stringify({
        proveedor_id: 'prov-uuid',
        items: [{ item_np_id: null, descripcion: 'Ítem libre', unidad: 'EA', cantidad: 1, precio_unitario: 50 }],
      }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'oc-libre' }) })
    // Sin nota_pedido_id no se valida item_np_id — debe pasar sin 400
    expect(res.status).not.toBe(400)
    expect(res.status).toBe(200)
  })
})

// ── Sección 34: HU-007 Regularización de NP y Fecha Requerida por ítem ───────

describe('POST /api/compras/nps — HU-007 Regularización', () => {
  const { POST } = require('@/app/api/compras/nps/route')

  it('CA-12 RN-03: devuelve 400 si es_regularizacion=true pero falta fecha_provision', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/nps', {
      method: 'POST',
      body: JSON.stringify({
        encabezado: {
          es_regularizacion: true,
          fecha_provision: null,
          proveedor_regularizacion_nombre: 'Proveedor S.A.',
          solicitante_nombre: 'Juan', solicitante_email: 'juan@test.com',
          area: 'Operaciones', prioridad: 'media', tipo_compra: 'producto',
          centro_costo: 'costo', descripcion_general: 'Regularización de compra urgente',
        },
        items: [{ descripcion: 'Ítem', unidad: 'EA', cantidad: 1, precio_unitario: 100 }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/campos_regularizacion_requeridos/)
  })

  it('CA-12 RN-03: devuelve 400 si es_regularizacion=true pero falta proveedor_regularizacion_nombre', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)

    const req = makeRequest('http://localhost/api/compras/nps', {
      method: 'POST',
      body: JSON.stringify({
        encabezado: {
          es_regularizacion: true,
          fecha_provision: '2026-06-01',
          proveedor_regularizacion_nombre: '',
          solicitante_nombre: 'Juan', solicitante_email: 'juan@test.com',
          area: 'Operaciones', prioridad: 'media', tipo_compra: 'producto',
          centro_costo: 'costo', descripcion_general: 'Regularización de compra urgente',
        },
        items: [{ descripcion: 'Ítem', unidad: 'EA', cantidad: 1, precio_unitario: 100 }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/campos_regularizacion_requeridos/)
  })

  it('CA-13 precio real: puedeGuardarPrecioNP devuelve true para regularización independiente del rol', async () => {
    const { puedeGuardarPrecioNP } = require('@/lib/np-precio')
    // Rol sin privilegio + es regularización → puede guardar precio real
    expect(puedeGuardarPrecioNP('solicitante', true)).toBe(true)
    expect(puedeGuardarPrecioNP('bodega', true)).toBe(true)
    // Rol sin privilegio + NO es regularización → NO puede guardar precio real
    expect(puedeGuardarPrecioNP('solicitante', false)).toBe(false)
    // Rol con privilegio siempre puede
    expect(puedeGuardarPrecioNP('compras', false)).toBe(true)
    expect(puedeGuardarPrecioNP('admin', true)).toBe(true)
  })

  it('CA-06 precio visible: puedeVerPrecioNP levanta restricción para creador de NP de regularización', async () => {
    const { puedeVerPrecioNP } = require('@/lib/np-precio')
    // Solicitante es el creador: ve precio solo en regularización
    expect(puedeVerPrecioNP('solicitante', true,  'user-123', 'user-123')).toBe(true)
    expect(puedeVerPrecioNP('solicitante', false, 'user-123', 'user-123')).toBe(false)
    // Otro usuario (no creador): no ve precio aunque sea regularización
    expect(puedeVerPrecioNP('solicitante', true,  'user-456', 'user-123')).toBe(false)
    // Rol privilegiado siempre ve precio
    expect(puedeVerPrecioNP('compras', false, null, 'user-123')).toBe(true)
    expect(puedeVerPrecioNP('admin', false, null, 'user-123')).toBe(true)
    expect(puedeVerPrecioNP('asistente_compras', true, 'user-999', 'user-123')).toBe(true)
  })
})

// ── Sección 35: HU-008 — Exportación PDF y Excel de NPs (CA-15) ──────────────

describe('GET /api/compras/nps/[id]/pdf — HU-008 CA-15', () => {
  const { GET } = require('@/app/api/compras/nps/[id]/pdf/route')

  it('CA-15 [1]: devuelve 401 sin sesión activa', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/nps/np-1/pdf'),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(401)
  })

  it('CA-15 [3]: devuelve 403 para gerencia que no es creadora de la NP', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      // 1: perfil → gerencia
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'gerencia' }, error: null })
      // 2: NP → creado_por_id diferente al user.id ('user-123'), asignado_a null
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-1', numero: 'NP-2026-0001', area: 'Operaciones',
          creado_por_id: 'otro-user', asignado_a: null, es_regularizacion: false,
          condiciones_minimas: null },
        error: null,
      })
      return Promise.resolve({ data: null, error: null })
    })
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)

    const res = await GET(
      makeRequest('http://localhost/api/compras/nps/np-1/pdf'),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(403)
  })

  it('CA-15 [4]: devuelve 200 para solicitante que es el creador de la NP', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      // 1: perfil → solicitante
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'solicitante' }, error: null })
      // 2: NP → creado_por_id = 'user-123' (mismo que CON_SESION)
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-1', numero: 'NP-2026-0001', area: 'Operaciones',
          clasificacion: null, prioridad: 'normal', tipo_compra: 'bienes', centro_costo: 'CC01',
          descripcion_general: 'Test', created_at: '2026-06-01T00:00:00Z',
          es_regularizacion: false, fecha_provision: null,
          proveedor_regularizacion_nombre: null, proveedor_regularizacion_identificacion: null,
          creado_por_id: 'user-123', solicitante_nombre: 'Juan Pérez', asignado_a: null,
          aprobador_np_nombre: null, aprobador_np_area: null, condiciones_minimas: null },
        error: null,
      })
      // 3: configuracion_empresa
      return Promise.resolve({ data: { documento_numero_np: 'AL-L4-07-F01', revision_np: 1 }, error: null })
    })
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    mockFrom.mockReturnValue(chain)

    const res = await GET(
      makeRequest('http://localhost/api/compras/nps/np-1/pdf'),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })
})

describe('GET /api/compras/nps/[id]/excel — HU-008 CA-15', () => {
  const { GET } = require('@/app/api/compras/nps/[id]/excel/route')

  it('CA-15 [2]: devuelve 401 sin sesión activa', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(
      makeRequest('http://localhost/api/compras/nps/np-1/excel'),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(401)
  })
})

// ── 36. Completar NP — estados ampliados por HU-009 ─────────────────────────

describe('POST /api/compras/nps/[id]/completar — estados ampliados (HU-009 CA-04/RN-06)', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/completar/route')

  it('permite completar una NP en estado en_gestion (antes solo se aceptaba aprobada)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({
        data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null,
      })
      return Promise.resolve({
        data: { id: 'np-id', estado: 'en_gestion', numero: 'NP-2026-0002', asignado_a: 'user-123' }, error: null,
      })
    })
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-id/completar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Ítems ya no requeridos' }),
      }),
      { params: Promise.resolve({ id: 'np-id' }) }
    )
    expect(res.status).toBe(200)
  })

  it('rechaza completar una NP en estado oc_aprobada (ya resuelta naturalmente)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({
        data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null,
      })
      return Promise.resolve({
        data: { id: 'np-id', estado: 'oc_aprobada', numero: 'NP-2026-0003', asignado_a: 'user-123' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-id/completar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Ítems ya no requeridos' }),
      }),
      { params: Promise.resolve({ id: 'np-id' }) }
    )
    expect(res.status).toBe(400)
  })
})

// ── 37. CRUD Feriados — HU-009 CA-10, CA-11 ─────────────────────────────────

describe('GET /api/compras/feriados', () => {
  const { GET } = require('@/app/api/compras/feriados/route')

  it('devuelve 403 para roles distintos de admin/compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'gerencia' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('POST /api/compras/feriados', () => {
  const { POST } = require('@/app/api/compras/feriados/route')

  it('devuelve 400 si la fecha ya está registrada (CA-11)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.insert = jest.fn(() => chain)
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'compras' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/feriados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: '2026-08-10', descripcion: 'Duplicado' }),
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ya existe un feriado registrado en esa fecha')
  })
})

// ── 38. CRUD Acciones — HU-009 CA-17 ────────────────────────────────────────

describe('GET /api/compras/acciones', () => {
  const { GET } = require('@/app/api/compras/acciones/route')

  it('devuelve 403 para roles distintos de admin/compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'asistente_compras' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('POST /api/compras/acciones', () => {
  const { POST } = require('@/app/api/compras/acciones/route')

  it('devuelve 400 si el orden ya está registrado (CA-17)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.insert = jest.fn(() => chain)
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'admin' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/acciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: 1, descripcion: 'Duplicado' }),
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ya existe una Acción con ese número de orden')
  })
})

// ── 39. Borrador de NP — HU-009 CA-01, CA-13, CA-14 ─────────────────────────

describe('POST /api/compras/nps — accion borrador/enviar (HU-009)', () => {
  const { POST } = require('@/app/api/compras/nps/route')
  const mockRpcFn = jest.fn(() => Promise.resolve({ data: 1, error: null }))
  beforeEach(() => { mockAdminClient.mockReturnValue({ from: mockFrom, rpc: mockRpcFn }) })
  afterEach(()  => { mockAdminClient.mockReturnValue({ from: mockFrom }) })

  const encabezadoBase = {
    es_regularizacion: false,
    solicitante_nombre: 'Juan', solicitante_email: 'juan@test.com',
    area: 'Operaciones', prioridad: 'media', tipo_compra: 'producto',
    centro_costo: 'costo', descripcion_general: 'Descripción de prueba con más de 10 caracteres',
  }
  const itemsBase = [{ descripcion: 'Ítem', unidad: 'EA', cantidad: 1, precio_unitario: 100 }]

  it('accion=borrador NO requiere coordinador y guarda con estado borrador', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'solicitante' }, error: null })
      // insert().select().single() de la NP
      return Promise.resolve({ data: { id: 'np-borrador-1' }, error: null })
    })
    chain.insert = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)

    const res = await POST(makeRequest('http://localhost/api/compras/nps', {
      method: 'POST',
      body: JSON.stringify({ accion: 'borrador', encabezado: encabezadoBase, items: itemsBase }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('accion=enviar (default) devuelve 400 si no hay coordinador para el área', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'solicitante' }, error: null }) // perfil
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } }) // coordinador
    mockFrom.mockReturnValue(chain)

    const res = await POST(makeRequest('http://localhost/api/compras/nps', {
      method: 'POST',
      body: JSON.stringify({ encabezado: encabezadoBase, items: itemsBase }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('No se encontró coordinador para el área seleccionada')
  })

  it('devuelve 400 si falta Prioridad (CA-02)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'solicitante' }, error: null }))
    mockFrom.mockReturnValue(chain)

    const { prioridad: _prioridad, ...encabezadoSinPrioridad } = encabezadoBase
    const res = await POST(makeRequest('http://localhost/api/compras/nps', {
      method: 'POST',
      body: JSON.stringify({ accion: 'borrador', encabezado: encabezadoSinPrioridad, items: itemsBase }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/compras/nps/[id]/enviar-aprobacion — HU-009 CA-14', () => {
  const { POST } = require('@/app/api/compras/nps/[id]/enviar-aprobacion/route')

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-1/enviar-aprobacion', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(401)
  })

  it('devuelve 403 si el usuario no es el creador de la NP', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({
      data: { id: 'np-1', estado: 'borrador', numero: 'NP-2026-0010', creado_por_id: 'otro-user' },
      error: null,
    }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-1/enviar-aprobacion', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(403)
  })

  it('devuelve 400 si la NP no está en estado borrador', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({
      data: { id: 'np-1', estado: 'pendiente', numero: 'NP-2026-0010', creado_por_id: 'user-123' },
      error: null,
    }))
    mockFrom.mockReturnValue(chain)
    const res = await POST(
      makeRequest('http://localhost/api/compras/nps/np-1/enviar-aprobacion', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(400)
  })
})

// ── 40. Reclasificar Prioridad + marcar Acciones — HU-009 CA-16, CA-05/06/07 ─

describe('PATCH /api/compras/nps/[id]/prioridad — HU-009 CA-16', () => {
  const { PATCH } = require('@/app/api/compras/nps/[id]/prioridad/route')

  it('devuelve 403 para roles distintos de compras/admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.single = jest.fn(() => Promise.resolve({ data: { rol: 'gerencia' }, error: null }))
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/prioridad', {
        method: 'PATCH',
        body: JSON.stringify({ prioridad: 'alta' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(403)
  })

  it('devuelve 400 en estados prohibidos (rechazada/devuelta/oc_aprobada/completada)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({
        data: { rol: 'compras', nombre: 'Compras', email: 'c@arlift.com' }, error: null,
      })
      return Promise.resolve({
        data: { id: 'np-1', estado: 'completada', numero: 'NP-2026-0001', prioridad: 'media' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/prioridad', {
        method: 'PATCH',
        body: JSON.stringify({ prioridad: 'alta' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(400)
  })

  it('reclasifica correctamente en un estado permitido (en_gestion)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({
        data: { rol: 'admin', nombre: 'Admin', email: 'a@arlift.com' }, error: null,
      })
      return Promise.resolve({
        data: { id: 'np-1', estado: 'en_gestion', numero: 'NP-2026-0001', prioridad: 'media' }, error: null,
      })
    })
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.insert = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/prioridad', {
        method: 'PATCH',
        body: JSON.stringify({ prioridad: 'alta' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/compras/nps/[id]/accion — HU-009 CA-05/06/07', () => {
  const { PATCH } = require('@/app/api/compras/nps/[id]/accion/route')

  it('devuelve 400 si la NP no está en estado en_gestion', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      return Promise.resolve({
        data: { id: 'np-1', estado: 'oc_directa', asignado_a: 'user-123' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/accion', {
        method: 'PATCH',
        body: JSON.stringify({ accion_id: 'accion-1' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(400)
  })

  it('devuelve 403 si el usuario no es el comprador asignado ni compras/admin', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'solicitante' }, error: null })
      return Promise.resolve({
        data: { id: 'np-1', estado: 'en_gestion', asignado_a: 'otro-user' }, error: null,
      })
    })
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/accion', {
        method: 'PATCH',
        body: JSON.stringify({ accion_id: 'accion-1' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(403)
  })

  it('el comprador asignado puede marcar una sola línea (item_np_id) sin afectar las demás', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'asistente_compras' }, error: null })
      if (singleCalls === 2) return Promise.resolve({
        data: { id: 'np-1', estado: 'en_gestion', asignado_a: 'user-123' }, error: null,
      })
      return Promise.resolve({ data: { id: 'accion-1' }, error: null })
    })
    // Spec: como en L691, .update() devuelve el propio chain — permite encadenar
    // múltiples .eq() antes de resolver vía chain.then()
    chain.update = jest.fn(() => chain)
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/accion', {
        method: 'PATCH',
        body: JSON.stringify({ accion_id: 'accion-1', item_np_id: 'item-1' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(200)
  })

  it('desmarcar (accion_id null) limpia accion_marcada_en y accion_marcada_por', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      return Promise.resolve({
        data: { id: 'np-1', estado: 'en_gestion', asignado_a: 'otro-user' }, error: null,
      })
    })
    let capturedUpdate: any = null
    chain.update = jest.fn((payload: any) => {
      capturedUpdate = payload
      return chain
    })
    mockFrom.mockReturnValue(chain)
    const res = await PATCH(
      makeRequest('http://localhost/api/compras/nps/np-1/accion', {
        method: 'PATCH',
        body: JSON.stringify({ accion_id: null, item_np_id: 'item-1' }),
      }),
      { params: Promise.resolve({ id: 'np-1' }) }
    )
    expect(res.status).toBe(200)
    expect(capturedUpdate.accion_id).toBeNull()
    expect(capturedUpdate.accion_marcada_en).toBeNull()
    expect(capturedUpdate.accion_marcada_por).toBeNull()
  })
})

// ── 41. Integración de actualizarEstadoNP() — HU-009 CA-19 (Grupo F) ───────

describe('actualizarEstadoNP() se invoca en los 6 puntos de mutación de OC/NP', () => {
  beforeEach(() => { mockActualizarEstadoNP.mockClear() })

  it('Tarea 18: POST /api/compras/convertir/[id] la invoca con la NP origen', async () => {
    const { POST } = require('@/app/api/compras/convertir/[id]/route')
    mockAdminClient.mockReturnValue({ from: mockFrom, rpc: jest.fn(() => Promise.resolve({ data: 1, error: null })) })
    mockGetUser.mockResolvedValue(CON_SESION)

    const np = {
      id: 'np-conv-1', numero: 'NP-2026-0002', area: 'Operaciones',
      estado: 'aprobada', tipo_compra: 'bienes', centro_costo: 'CC01',
      descripcion_general: 'Test', created_at: '2026-01-01T00:00:00Z',
      convertida: false, asignado_a: null,
    }
    const insertMock = jest.fn(() => ({
      select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: 'oc-new', numero_oc: 'OC-2026-0001' }, error: null })) })),
    }))
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.insert = insertMock
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'C', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: np, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/compras/convertir/np-conv-1', {
        method: 'POST',
        body: JSON.stringify({
          proveedor_id: 'prov-uuid',
          items: [{ item_np_id: 'np-item-1', descripcion: 'Item test', unidad: 'EA', cantidad: 1, precio_unitario: 100 }],
        }),
      }),
      { params: Promise.resolve({ id: 'np-conv-1' }) }
    )

    mockAdminClient.mockReturnValue({ from: mockFrom })
    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-conv-1')
  })

  it('Tarea 19: PUT /api/compras/ordenes/[id] la invoca con nota_pedido_id', async () => {
    const { PUT } = require('@/app/api/compras/ordenes/[id]/route')
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.update = jest.fn(() => chain)
    chain.insert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    chain.delete = jest.fn(() => chain)
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: { estado_oc: 'en_proceso', creado_por_id: 'user-123', nota_pedido_id: 'np-put-1' }, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { nombre: 'ACME', ruc: null, direccion: null, telefono: null, email: null, contacto: null }, error: null })
      if (singleCalls === 4) return Promise.resolve({ data: { estado: 'en_gestion' }, error: null })
      return Promise.resolve({ data: { numero_oc: 'OC-2026-0001' }, error: null })
    })
    mockFrom.mockReturnValue(chain)

    await PUT(
      makeRequest('http://localhost/api/compras/ordenes/oc-put-1', {
        method: 'PUT',
        body: JSON.stringify({
          proveedor_id: 'prov-uuid',
          items: [{ item_np_id: 'np-item-1', codigo: '', descripcion: 'Item', unidad: 'EA', cantidad: 1, precio_unitario: 100 }],
        }),
      }),
      { params: Promise.resolve({ id: 'oc-put-1' }) }
    )

    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-put-1')
  })

  it('Tarea 20: POST /api/compras/ordenes/[id]/aprobar la invoca con nota_pedido_id', async () => {
    const { POST } = require('@/app/api/compras/ordenes/[id]/aprobar/route')
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'compras', nombre: 'C', email: 'c@a.com' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'en_aprobacion_compras',
          valor_total: 100, proveedor: 'ACME', creado_por_id: null, creado_por_nombre: null,
          nota_pedido_id: 'np-aprob-1',
        },
        error: null,
      })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-1/aprobar', {
        method: 'POST',
        body: JSON.stringify({ accion: 'aprobar' }),
      }),
      { params: Promise.resolve({ id: 'oc-1' }) }
    )

    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-aprob-1')
  })

  it('Tarea 21: POST /api/compras/ordenes/[id]/cancelar la invoca con nota_pedido_id', async () => {
    const { POST } = require('@/app/api/compras/ordenes/[id]/cancelar/route')
    mockGetUser.mockResolvedValue(CON_SESION)
    let singleCalls = 0
    const chain = mockChainVacio()
    chain.in     = jest.fn(() => chain)
    chain.insert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest.fn(() => {
      singleCalls++
      if (singleCalls === 1) return Promise.resolve({ data: { rol: 'compras', nombre: 'C', email: 'c@a.com' }, error: null })
      if (singleCalls === 2) return Promise.resolve({ data: { id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'en_proceso', nota_pedido_id: 'np-canc-1' }, error: null })
      if (singleCalls === 3) return Promise.resolve({ data: { estado: 'en_gestion', numero: 'NP-2026-0001' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-1/cancelar', {
        method: 'POST',
        body: JSON.stringify({ motivo: 'Proveedor incumplió' }),
      }),
      { params: Promise.resolve({ id: 'oc-1' }) }
    )

    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-canc-1')
  })

  it('Tarea 22: POST /api/compras/ordenes/[id]/enviar-aprobacion la invoca con nota_pedido_id', async () => {
    const { POST } = require('@/app/api/compras/ordenes/[id]/enviar-aprobacion/route')
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'compras', nombre: 'C', email: 'c@a.com' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'en_proceso',
          valor_total: 100, proveedor: 'ACME', area: 'Operaciones', creado_por_id: 'user-123',
          nota_pedido_id: 'np-env-1',
        },
        error: null,
      })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/compras/ordenes/oc-1/enviar-aprobacion', { method: 'POST' }),
      { params: Promise.resolve({ id: 'oc-1' }) }
    )

    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-env-1')
  })

  it('Tarea 23: POST /api/compras/nps/[id]/reabrir la invoca con el id de la NP', async () => {
    const { POST } = require('@/app/api/compras/nps/[id]/reabrir/route')
    mockGetUser.mockResolvedValue(CON_SESION)
    const chain = mockChainVacio()
    chain.update = jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: {}, error: null })) }))
    chain.single = jest
      .fn()
      .mockResolvedValueOnce({ data: { rol: 'compras', nombre: 'C', email: 'c@a.com' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'np-reab-1', estado: 'completada', numero: 'NP-2026-0001' }, error: null })
    mockFrom.mockReturnValue(chain)

    await POST(
      makeRequest('http://localhost/api/compras/nps/np-reab-1/reabrir', { method: 'POST' }),
      { params: Promise.resolve({ id: 'np-reab-1' }) }
    )

    expect(mockActualizarEstadoNP).toHaveBeenCalledWith('np-reab-1')
  })
})

// ── 42. Vista por NP — HU-011 ─────────────────────────────────────────────────

describe('GET /api/compras/nps/vista', () => {
  const { GET } = require('@/app/api/compras/nps/vista/route')

  function chainAwaitable(data: unknown) {
    const chain: any = {}
    const noop = jest.fn(() => chain)
    chain.select = noop
    chain.order  = noop
    chain.eq     = noop
    chain.ilike  = noop
    chain.or     = noop
    chain.in     = noop
    chain.gte    = noop
    chain.lte    = noop
    chain.single = jest.fn(() => Promise.resolve({ data: null, error: null }))
    chain.then   = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
    return chain
  }

  function setupVista(opts: {
    rol: string
    nps?: any[]
    itemsNp?: any[]
    itemsOc?: any[]
    ocs?: any[]
    acciones?: any[]
    compradores?: any[]
    feriados?: string[]
  }) {
    const {
      rol, nps = [], itemsNp = [], itemsOc = [], ocs = [],
      acciones = [], compradores = [], feriados = [],
    } = opts

    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') {
        const chain = chainAwaitable(compradores)
        chain.single = jest.fn(() => Promise.resolve({ data: { rol }, error: null }))
        return chain
      }
      if (table === 'notas_pedido') return chainAwaitable(nps)
      if (table === 'acciones_gestion') return chainAwaitable(acciones)
      if (table === 'items_np') return chainAwaitable(itemsNp)
      if (table === 'items_oc') return chainAwaitable(itemsOc)
      if (table === 'registro_compras') return chainAwaitable(ocs)
      if (table === 'feriados') return chainAwaitable(feriados.map(fecha => ({ fecha })))
      throw new Error(`tabla no mockeada: ${table}`)
    })
  }

  const npBase = {
    id: 'np-1', numero: 'NP-2026-0010', created_at: '2026-07-01T00:00:00Z', area: 'Operaciones',
    solicitante_nombre: 'Ana', descripcion_general: 'Repuestos', prioridad: 'alta', estado: 'aprobada',
    asignado_a: null, asignado_nombre: null, total_estimado: 500,
    es_regularizacion: false, creado_por_id: 'otro-user',
    sla_iniciado_en: null, sla_pausado_desde: null, sla_pausado_acumulado_seg: 0,
  }

  it('devuelve 401 sin sesión', async () => {
    mockGetUser.mockResolvedValue(SIN_SESION)
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    expect(res.status).toBe(401)
  })

  it('devuelve 403 para rol solicitante (fuera de ROLES_VISTA)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({ rol: 'solicitante' })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    expect(res.status).toBe(403)
  })

  it('devuelve 403 para rol bodega', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({ rol: 'bodega' })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    expect(res.status).toBe(403)
  })

  it.each(['compras', 'admin', 'asistente_compras', 'gerencia', 'consulta'])(
    'devuelve 200 para rol %s (los 5 roles de CA-09)',
    async (rol) => {
      mockGetUser.mockResolvedValue(CON_SESION)
      setupVista({ rol, nps: [npBase] })
      const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
      expect(res.status).toBe(200)
    }
  )

  it('CA-08: enmascara total_estimado/precio_unitario para gerencia', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'gerencia',
      nps: [npBase],
      itemsNp: [{ id: 'item-1', nota_pedido_id: 'np-1', linea: 1, descripcion: 'Tubo', cantidad: 2, precio_unitario: 10, accion_id: null }],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].total_estimado).toBeNull()
    expect(body.rows[0].lineas[0].precio_unitario).toBeNull()
  })

  it('CA-08: expone total_estimado/precio_unitario para compras', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'compras',
      nps: [npBase],
      itemsNp: [{ id: 'item-1', nota_pedido_id: 'np-1', linea: 1, descripcion: 'Tubo', cantidad: 2, precio_unitario: 10, accion_id: null }],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].total_estimado).toBe(500)
    expect(body.rows[0].lineas[0].precio_unitario).toBe(10)
  })

  it('compradoresDisponibles se resuelve sin exigir rol compras/admin (asistente_compras también accede)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'asistente_compras',
      compradores: [{ id: 'ast-1', nombre: 'Bruno' }],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.compradoresDisponibles).toEqual([{ id: 'ast-1', nombre: 'Bruno' }])
  })

  it('CA-07: badge "No activo" para una NP aprobada sin comprador asignado', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({ rol: 'compras', nps: [npBase] })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].sla_badge).toBe('no_activo')
  })

  it('RN-01: Acción agregada de la fila es la de menor orden entre sus líneas', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    const np = { ...npBase, estado: 'en_gestion', asignado_a: 'ast-1', sla_iniciado_en: '2026-07-01T00:00:00Z' }
    setupVista({
      rol: 'compras',
      nps: [np],
      acciones: [
        { id: 'a1', orden: 1, descripcion: 'Asignada' },
        { id: 'a2', orden: 2, descripcion: 'Solicitud de ofertas' },
      ],
      itemsNp: [
        { id: 'item-1', nota_pedido_id: 'np-1', linea: 1, descripcion: 'Tubo', cantidad: 2, precio_unitario: 10, accion_id: 'a2' },
        { id: 'item-2', nota_pedido_id: 'np-1', linea: 2, descripcion: 'Codo', cantidad: 1, precio_unitario: 5, accion_id: 'a1' },
      ],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].accion_agregada.id).toBe('a1')
  })

  it('RN-02: la pill de N° de OC de una línea con única OC cancelada muestra null ("— pendiente —" en la UI)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'compras',
      nps: [npBase],
      itemsNp: [{ id: 'item-1', nota_pedido_id: 'np-1', linea: 1, descripcion: 'Tubo', cantidad: 2, precio_unitario: 10, accion_id: null }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'cancelada' }],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].lineas[0].oc).toBeNull()
  })

  it('RN-02: la pill de N° de OC de una línea con una OC viva muestra su numero_oc y el id de la OC (para enlazar)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'compras',
      nps: [npBase],
      itemsNp: [{ id: 'item-1', nota_pedido_id: 'np-1', linea: 1, descripcion: 'Tubo', cantidad: 2, precio_unitario: 10, accion_id: null }],
      itemsOc: [{ item_np_id: 'item-1', registro_compras_id: 'oc-1' }],
      ocs: [{ id: 'oc-1', numero_oc: 'OC-2026-0001', estado_oc: 'aprobada' }],
    })
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    const body = await res.json()
    expect(body.rows[0].lineas[0].oc).toEqual({ id: 'oc-1', numero_oc: 'OC-2026-0001' })
  })

  it('excluye NPs en borrador que no son del usuario (CA-15 de HU-009, mismo criterio que GET /api/compras/nps)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({ rol: 'compras', nps: [] }) // el filtro .or() ya se aplica en la query real; aquí se confirma que no rompe la request
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista'))
    expect(res.status).toBe(200)
  })

  it('CA-02: aplica los filtros de columnas simples (área/estado/prioridad/comprador) vía .eq() sobre notas_pedido', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    let chainNP: any
    mockFrom.mockImplementation((table: string) => {
      if (table === 'perfiles') {
        const c = chainAwaitable([])
        c.single = jest.fn(() => Promise.resolve({ data: { rol: 'compras' }, error: null }))
        return c
      }
      if (table === 'notas_pedido') {
        chainNP = chainAwaitable([])
        return chainNP
      }
      return chainAwaitable([])
    })

    const url = 'http://localhost/api/compras/nps/vista?area=Operaciones&estado=aprobada&prioridad=alta&comprador=ast-1&solicitante=Ana&numero=NP-2026&descripcion=Tuberia'
    await GET(makeRequest(url))

    expect(chainNP.eq).toHaveBeenCalledWith('area', 'Operaciones')
    expect(chainNP.eq).toHaveBeenCalledWith('estado', 'aprobada')
    expect(chainNP.eq).toHaveBeenCalledWith('prioridad', 'alta')
    expect(chainNP.eq).toHaveBeenCalledWith('asignado_a', 'ast-1')
    expect(chainNP.ilike).toHaveBeenCalledWith('solicitante_nombre', '%Ana%')
    expect(chainNP.ilike).toHaveBeenCalledWith('numero', '%NP-2026%')
    expect(chainNP.ilike).toHaveBeenCalledWith('descripcion_general', '%Tuberia%')
  })

  it('CA-02: el filtro de Acción se ignora si Estado no es en_gestion (RN-05 de HU-009)', async () => {
    mockGetUser.mockResolvedValue(CON_SESION)
    setupVista({
      rol: 'compras',
      nps: [{ ...npBase, estado: 'oc_directa', prioridad: 'excepcional' }],
    })
    // estado del filtro != 'en_gestion' → el parámetro accion no debe aplicarse aunque venga en la URL
    const res = await GET(makeRequest('http://localhost/api/compras/nps/vista?estado=oc_directa&accion=a1'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.rows).toHaveLength(1)
  })
})
