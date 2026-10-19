// Spec: HU-020-v2.md — CA-01 a CA-05, RN-03, RN-04, RN-05, RN-06

import { validarEnmienda, TIPOS_ENMIENDA } from '@/lib/oca-enmiendas'

const ocaVigente = { estado: 'vigente', fecha_fin: '2026-12-31', presupuesto_total: 1000, tipo: 'precio_fijo' }
const ocaAgotada = { ...ocaVigente, estado: 'agotada' }
const ocaVencida = { ...ocaVigente, estado: 'vencida' }
const ocaSuspendida = { ...ocaVigente, estado: 'suspendida' }
const ocaBorrador = { ...ocaVigente, estado: 'borrador' }

const base = { justificacion: 'Justificación de prueba', referencia_contractual: 'CONTRATO-001' }

describe('validarEnmienda — tipo inválido y campos comunes (RN-03)', () => {
  it('rechaza un tipo fuera del dominio', () => {
    expect(validarEnmienda({ ...base, tipo: 'otro' }, ocaVigente)).not.toBeNull()
  })
  it('exporta los 3 tipos válidos', () => {
    expect(TIPOS_ENMIENDA.sort()).toEqual(['extension_plazo', 'incremento_presupuesto', 'modificacion_precios'].sort())
  })
  it('rechaza sin justificación', () => {
    const r = validarEnmienda({ tipo: 'incremento_presupuesto', referencia_contractual: 'X', monto_adicional: 100 }, ocaVigente)
    expect(r).toBe('La justificación es requerida')
  })
  it('rechaza sin referencia_contractual', () => {
    const r = validarEnmienda({ tipo: 'incremento_presupuesto', justificacion: 'X', monto_adicional: 100 }, ocaVigente)
    expect(r).toBe('La referencia contractual es requerida')
  })
})

describe('validarEnmienda — incremento_presupuesto (RN-04)', () => {
  it('válido desde vigente', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: 500 }, ocaVigente)).toBeNull()
  })
  it('válido desde agotada', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: 500 }, ocaAgotada)).toBeNull()
  })
  it('rechaza desde vencida', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: 500 }, ocaVencida)).not.toBeNull()
  })
  it('rechaza desde suspendida', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: 500 }, ocaSuspendida)).not.toBeNull()
  })
  it('rechaza monto_adicional = 0', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: 0 }, ocaVigente)).not.toBeNull()
  })
  it('rechaza monto_adicional negativo', () => {
    expect(validarEnmienda({ ...base, tipo: 'incremento_presupuesto', monto_adicional: -50 }, ocaVigente)).not.toBeNull()
  })
})

describe('validarEnmienda — extension_plazo (RN-05)', () => {
  it('válido desde vigente con fecha posterior', () => {
    expect(validarEnmienda({ ...base, tipo: 'extension_plazo', fecha_fin_nueva: '2027-06-30' }, ocaVigente)).toBeNull()
  })
  it('válido desde vencida', () => {
    expect(validarEnmienda({ ...base, tipo: 'extension_plazo', fecha_fin_nueva: '2027-06-30' }, ocaVencida)).toBeNull()
  })
  it('rechaza desde agotada', () => {
    expect(validarEnmienda({ ...base, tipo: 'extension_plazo', fecha_fin_nueva: '2027-06-30' }, ocaAgotada)).not.toBeNull()
  })
  it('rechaza fecha_fin_nueva anterior o igual a la actual', () => {
    expect(validarEnmienda({ ...base, tipo: 'extension_plazo', fecha_fin_nueva: '2026-12-31' }, ocaVigente)).not.toBeNull()
    expect(validarEnmienda({ ...base, tipo: 'extension_plazo', fecha_fin_nueva: '2026-01-01' }, ocaVigente)).not.toBeNull()
  })
})

describe('validarEnmienda — modificacion_precios (RN-06)', () => {
  const itemValido = { codigo: 'X', descripcion: 'X', unidad: 'EA', precio_unitario: 10 }
  it('válido desde vigente con ítems correctos para el tipo de la OCA (precio_fijo)', () => {
    expect(validarEnmienda({ ...base, tipo: 'modificacion_precios', items: [itemValido] }, ocaVigente)).toBeNull()
  })
  it('rechaza desde borrador/suspendida/agotada/vencida', () => {
    for (const oca of [ocaBorrador, ocaSuspendida, ocaAgotada, ocaVencida]) {
      expect(validarEnmienda({ ...base, tipo: 'modificacion_precios', items: [itemValido] }, oca)).not.toBeNull()
    }
  })
  it('rechaza sin ítems', () => {
    expect(validarEnmienda({ ...base, tipo: 'modificacion_precios', items: [] }, ocaVigente)).not.toBeNull()
  })
  it('rechaza ítem sin precio_unitario cuando la OCA es precio_fijo', () => {
    const r = validarEnmienda({ ...base, tipo: 'modificacion_precios', items: [{ codigo: 'X', descripcion: 'X', unidad: 'EA' }] }, ocaVigente)
    expect(r).not.toBeNull()
  })
  it('rechaza ítem sin precio_maximo cuando la OCA es precio_variable_tope', () => {
    const ocaVariable = { ...ocaVigente, tipo: 'precio_variable_tope' }
    const r = validarEnmienda({ ...base, tipo: 'modificacion_precios', items: [{ codigo: 'X', descripcion: 'X', unidad: 'EA' }] }, ocaVariable)
    expect(r).not.toBeNull()
  })
})
