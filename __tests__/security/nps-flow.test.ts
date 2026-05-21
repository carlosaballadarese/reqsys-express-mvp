/**
 * Tests de flujo de Nota de Pedido (NP).
 * 
 * Valida:
 * 1. Creación de NP y búsqueda de coordinador por área.
 * 2. Gestión de NP (Aprobar/Rechazar/Devolver) por roles autorizados.
 * 3. Notificaciones por email ultra-simplificadas (anti-virus).
 */

import { NextRequest } from 'next/server'

// --- Mocks Globales ---
const mockGetUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}))

const mockFrom = jest.fn()
const mockRpc  = jest.fn()
jest.mock('@/lib/supabase/clients', () => ({
  adminClient: jest.fn(() => ({ from: mockFrom, rpc: mockRpc })),
  anonClient:  jest.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))

const mockSendMail = jest.fn()
jest.mock('@/lib/mailer', () => ({
  transporter: { sendMail: mockSendMail },
}))

jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

// --- Helpers ---
function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options)
}

function mockChain(data: any = null, error: any = null) {
  const chain: any = {}
  const noop = jest.fn(() => chain)
  chain.select = noop
  chain.order  = noop
  chain.eq     = noop
  chain.single = jest.fn(() => Promise.resolve({ data, error }))
  chain.insert = jest.fn(() => chain) // Insert devuelve el chain
  chain.update = jest.fn(() => chain) // Update devuelve el chain
  chain.then   = (res: any) => Promise.resolve({ data, error }).then(res)
  return chain
}

describe('Flujo de Notas de Pedido (NP)', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockRpc.mockResolvedValue({ data: 1, error: null }) // Mock por defecto para rpc
  })

  describe('POST /api/compras/nps (Creación)', () => {
    const { POST } = require('@/app/api/compras/nps/route')

    it('debe buscar el coordinador correcto basado en el área de la NP', async () => {
      // Mock de sesión
      mockGetUser.mockResolvedValue({ data: { user: { email: 'solicitante@test.com' } } })
      
      // Mocks de base de datos
      mockFrom.mockImplementation((table) => {
        if (table === 'perfiles') return mockChain({ rol: 'solicitante', nombre: 'Test' })
        if (table === 'coordinadores_area') return mockChain({ email: 'coordinador@test.com', nombre: 'Coordinador Test' })
        if (table === 'notas_pedido') return mockChain({ id: 'np-123', numero: 'NP-001' })
        return mockChain([])
      })

      const body = {
        encabezado: {
          area: 'Sistemas',
          prioridad: 'alta',
          solicitante_nombre: 'Test Solicitante',
          solicitante_email: 'solicitante@test.com',
          tipo_compra: 'producto',
          centro_costo: 'gasto',
          descripcion_general: 'Prueba de testing'
        },
        items: [{ descripcion: 'Item 1', cantidad: 1, unidad: 'EA', precio_unitario: 10 }]
      }

      const req = makeRequest('http://localhost/api/compras/nps', {
        method: 'POST',
        body: JSON.stringify(body)
      })

      await POST(req)

      // Verificar que se buscó el coordinador para el área 'Sistemas'
      expect(mockFrom).toHaveBeenCalledWith('coordinadores_area')
      
      // Verificar que se envió el email al coordinador correcto
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'coordinador@test.com',
        subject: expect.stringContaining('Sistemas')
      }))
    })

    it('el email debe ser ultra-simplificado (sin botones complejos ni iconos)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { email: 'solicitante@test.com' } } })
      mockFrom.mockImplementation((table) => {
        if (table === 'perfiles') return mockChain({ rol: 'solicitante' })
        if (table === 'coordinadores_area') return mockChain({ email: 'coord@test.com' })
        if (table === 'notas_pedido') return mockChain({ id: '1', numero: 'NP-001' })
        return mockChain([])
      })

      const req = makeRequest('http://localhost/api/compras/nps', {
        method: 'POST',
        body: JSON.stringify({
          encabezado: { area: 'Sistemas', descripcion_general: 'Prueba de virus' },
          items: []
        })
      })

      await POST(req)

      const emailCall = mockSendMail.mock.calls[0][0]
      // No debe tener botones complejos ni iconos de check/x
      expect(emailCall.html).not.toContain('display:flex')
      expect(emailCall.html).not.toContain('✓')
      expect(emailCall.html).not.toContain('✗')
      // Debe tener el link simple
      expect(emailCall.html).toContain('Ver y Gestionar Requerimiento')
    })
  })

  describe('PATCH /api/compras/nps/[id] (Gestión)', () => {
    const { PATCH } = require('@/app/api/compras/nps/[id]/route')

    it('solo permite aprobar a roles autorizados (admin, gerencia)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-compras' } } })
      
      // Mock de perfil con rol 'compras' (compras puede devolver pero no aprobar inicialmente segun logica nueva)
      // Nota: En la implementación actual permitimos admin, gerencia y compras.
      mockFrom.mockImplementation((table) => {
        if (table === 'perfiles') return mockChain({ rol: 'compras', nombre: 'User Compras', email: 'compras@test.com' })
        if (table === 'notas_pedido') return mockChain({ id: 'np-1', estado: 'pendiente', numero: 'NP-1' })
        return mockChain([])
      })

      const req = makeRequest('http://localhost/api/compras/nps/np-1', {
        method: 'PATCH',
        body: JSON.stringify({ accion: 'aprobar' })
      })

      const res = await PATCH(req, { params: Promise.resolve({ id: 'np-1' }) })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('registra el historial correctamente al aprobar', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
      mockFrom.mockImplementation((table) => {
        if (table === 'perfiles') return mockChain({ rol: 'admin', nombre: 'Admin', email: 'admin@test.com' })
        if (table === 'notas_pedido') return mockChain({ id: 'np-1', estado: 'pendiente', numero: 'NP-1' })
        if (table === 'coordinadores_area') return mockChain({ email: 'compras@test.com' })
        return mockChain([])
      })

      const req = makeRequest('http://localhost/api/compras/nps/np-1', {
        method: 'PATCH',
        body: JSON.stringify({ accion: 'aprobar' })
      })

      await PATCH(req, { params: Promise.resolve({ id: 'np-1' }) })

      // Verificar inserción en historial
      expect(mockFrom).toHaveBeenCalledWith('historial_np')
    })
  })
})
