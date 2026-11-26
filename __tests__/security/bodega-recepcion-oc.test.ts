// Spec: HU-047 — cubre calcularCoberturaRecepcionOC() y generarRecepcionAdicionalOC()
// directamente contra un mock de adminClient(), mismo patrón ya usado en bodega-ingreso.test.ts.

const mockFrom = jest.fn()
const mockRpc = jest.fn(() => Promise.resolve({ data: 1, error: null }))
const mockAdminClient = jest.fn(() => ({ from: mockFrom, rpc: mockRpc }))

jest.mock('@/lib/supabase/clients', () => ({
  adminClient: () => mockAdminClient(),
}))
jest.mock('@/lib/auditoria', () => ({
  registrarAuditoria: jest.fn(),
}))

import { calcularCoberturaRecepcionOC } from '@/lib/bodega-recepcion-oc'
import { generarRecepcionAdicionalOC } from '@/lib/bodega-ingreso'

const ACTOR = { id: 'user-1', nombre: 'Bodega Test', email: 'bodega@arlift.com', rol: 'bodega' }

function chainTabla(porTabla: Record<string, any>) {
  return (table: string) => {
    const result = porTabla[table] ?? { data: null, error: null }
    const obj: any = {}
    obj.select = () => obj
    obj.eq     = () => obj
    obj.in     = () => obj
    obj.order  = () => obj
    obj.insert = (payload: unknown) => {
      if (porTabla[table]?.onInsert) porTabla[table].onInsert(payload)
      return porTabla[table]?.insertResult ?? obj
    }
    obj.single = () => Promise.resolve(result)
    obj.then   = (resolve: any) => Promise.resolve(result).then(resolve)
    return obj
  }
}

describe('calcularCoberturaRecepcionOC — CA-03/CA-04/CA-06/CA-07', () => {
  it('sin ítems elegibles (OC 100% SERVICIOS): por_item vacío, oc_recibida_100 vacuamente true', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Mano de obra', cantidad: 10, tipo: 'SERVICIOS' }], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado).toEqual({ por_item: [], oc_recibida_100: true })
  })

  it('línea sin ninguna recepción: cantidad_recibida=0, saldo=cantidad_comprada (RN-02)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item).toEqual([
      { item_oc_id: 'i1', linea: 1, descripcion: 'Válvula', cantidad_comprada: 10, cantidad_recibida: 0, saldo: 10, porcentaje: 0, sobre_recepcion: false },
    ])
    expect(resultado.oc_recibida_100).toBe(false)
  })

  it('línea con Documento de Ingreso en estado generado (sin cerrar): NO cuenta como recibida (RN-02)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [{ item_oc_id: 'i1', cantidad: 10, documento_ingreso_id: 'doc-1' }], error: null },
      documentos_ingreso: { data: [], error: null }, // .eq('estado','cerrado') -> ninguno
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item[0]).toMatchObject({ cantidad_recibida: 0, saldo: 10 })
  })

  it('recepción parcial real: 2 Documentos de Ingreso cerrados para la misma línea se acumulan (CA-02/CA-03)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: {
        data: [
          { item_oc_id: 'i1', cantidad: 4, documento_ingreso_id: 'doc-1' },
          { item_oc_id: 'i1', cantidad: 3, documento_ingreso_id: 'doc-2' },
        ],
        error: null,
      },
      documentos_ingreso: { data: [{ id: 'doc-1', estado: 'cerrado' }, { id: 'doc-2', estado: 'cerrado' }], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item[0]).toMatchObject({ cantidad_recibida: 7, saldo: 3, sobre_recepcion: false })
    expect(resultado.oc_recibida_100).toBe(false)
  })

  it('OC 100% recibida: todas las líneas con saldo<=0 (CA-04)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [{ item_oc_id: 'i1', cantidad: 10, documento_ingreso_id: 'doc-1' }], error: null },
      documentos_ingreso: { data: [{ id: 'doc-1', estado: 'cerrado' }], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.oc_recibida_100).toBe(true)
  })

  it('sobre-recepción real: cantidad_recibida > cantidad_comprada, saldo clampeado a 0, nunca bloquea (CA-05/RN-04)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [{ item_oc_id: 'i1', cantidad: 15, documento_ingreso_id: 'doc-1' }], error: null },
      documentos_ingreso: { data: [{ id: 'doc-1', estado: 'cerrado' }], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item[0]).toMatchObject({ cantidad_recibida: 15, saldo: 0, sobre_recepcion: true })
    expect(resultado.oc_recibida_100).toBe(true)
  })

  it('ítems tipo SERVICIOS se excluyen del cálculo aunque la OC tenga también BIENES (CA-06)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: {
        data: [
          { id: 'i1', linea: 1, descripcion: 'Válvula', cantidad: 10, tipo: 'BIENES' },
          { id: 'i2', linea: 2, descripcion: 'Instalación', cantidad: 1, tipo: 'SERVICIOS' },
        ],
        error: null,
      },
      documentos_ingreso_items: { data: [], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item).toHaveLength(1)
    expect(resultado.por_item[0].item_oc_id).toBe('i1')
  })

  it('línea "sin producto vinculado" (producto_id=NULL en el Documento de Ingreso) sigue contando por su item_oc_id (CA-07)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', linea: 1, descripcion: 'Ítem sin catálogo', cantidad: 5, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [{ item_oc_id: 'i1', cantidad: 5, documento_ingreso_id: 'doc-1' }], error: null },
      documentos_ingreso: { data: [{ id: 'doc-1', estado: 'cerrado' }], error: null },
    }))
    const resultado = await calcularCoberturaRecepcionOC('oc-1')
    expect(resultado.por_item[0]).toMatchObject({ cantidad_recibida: 5, saldo: 0 })
  })
})

describe('generarRecepcionAdicionalOC — CA-01/CA-02/RN-03', () => {
  it('bloquea si no se envían líneas', async () => {
    const resultado = await generarRecepcionAdicionalOC('oc-1', [], ACTOR)
    expect(resultado.ok).toBe(false)
  })

  it('bloquea si alguna línea no pertenece a la OC (seguridad: item_oc_id de otra OC)', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', registro_compras_id: 'oc-OTRA', codigo: 'X', descripcion: 'X', precio_unitario: 1 }], error: null },
    }))
    const resultado = await generarRecepcionAdicionalOC('oc-1', [{ item_oc_id: 'i1', cantidad: 5 }], ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/no pertenece/)
  })

  it('RN-03: bloquea si NINGUNA línea elegida tiene saldo pendiente real', async () => {
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', registro_compras_id: 'oc-1', linea: 1, descripcion: 'Válvula', codigo: 'AL-I0001', cantidad: 10, precio_unitario: 20, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [{ item_oc_id: 'i1', cantidad: 10, documento_ingreso_id: 'doc-1' }], error: null },
      documentos_ingreso: { data: [{ id: 'doc-1', estado: 'cerrado' }], error: null },
    }))
    const resultado = await generarRecepcionAdicionalOC('oc-1', [{ item_oc_id: 'i1', cantidad: 3 }], ACTOR)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/saldo pendiente/)
  })

  it('ruta feliz: genera el Documento de Ingreso con item_oc_id real, registro_compras_id de la OC, y producto_id resuelto por código', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', registro_compras_id: 'oc-1', linea: 1, descripcion: 'Válvula', codigo: 'AL-I0001', cantidad: 10, precio_unitario: 20, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [], onInsert: insertSpy, error: null },
      documentos_ingreso: {
        data: [], // cobertura: sin recepciones previas -> saldo completo
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-2', numero: 'ING-2026-0099' }, error: null }) }) },
      },
      inventario: { data: [{ id: 'prod-1', codigo: 'AL-I0001' }], error: null },
    }))
    const resultado = await generarRecepcionAdicionalOC('oc-1', [{ item_oc_id: 'i1', cantidad: 4 }], ACTOR)
    expect(resultado).toEqual({ ok: true, documentoId: 'doc-2', numero: 'ING-2026-0099' })
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        documento_ingreso_id: 'doc-2',
        item_oc_id: 'i1',
        producto_id: 'prod-1',
        codigo_oc: 'AL-I0001',
        cantidad: 4,
        costo_unitario: 20,
      }),
    ])
  })

  it('CA-01b: producto_id=NULL cuando el código de la línea no matchea ningún producto real', async () => {
    const insertSpy = jest.fn()
    mockFrom.mockImplementation(chainTabla({
      items_oc: { data: [{ id: 'i1', registro_compras_id: 'oc-1', linea: 1, descripcion: 'Sin catálogo', codigo: 'NO-EXISTE', cantidad: 5, precio_unitario: 10, tipo: 'BIENES' }], error: null },
      documentos_ingreso_items: { data: [], onInsert: insertSpy, error: null },
      documentos_ingreso: {
        data: [],
        insertResult: { select: () => ({ single: () => Promise.resolve({ data: { id: 'doc-3', numero: 'ING-2026-0100' }, error: null }) }) },
      },
      inventario: { data: [], error: null },
    }))
    await generarRecepcionAdicionalOC('oc-1', [{ item_oc_id: 'i1', cantidad: 5 }], ACTOR)
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({ producto_id: null, codigo_oc: 'NO-EXISTE' }),
    ])
  })
})
