import { validarRucEcuador } from '@/lib/validators'

describe('validarRucEcuador', () => {
  // Casos válidos
  it('acepta RUC válido persona natural (tercer dígito 0)', () =>
    expect(validarRucEcuador('0102030405001')).toBe(true))

  it('acepta RUC válido persona natural (tercer dígito 6)', () =>
    expect(validarRucEcuador('0162030405001')).toBe(true))

  it('acepta RUC válido sociedad privada (tercer dígito 9)', () =>
    expect(validarRucEcuador('0190012345001')).toBe(true))

  it('acepta provincia 01 (mínimo válido)', () =>
    expect(validarRucEcuador('0102030405001')).toBe(true))

  it('acepta provincia 24 (máximo válido)', () =>
    expect(validarRucEcuador('2402030405001')).toBe(true))

  // Casos inválidos — longitud
  it('rechaza RUC con menos de 13 dígitos', () =>
    expect(validarRucEcuador('012345678901')).toBe(false))

  it('rechaza RUC con más de 13 dígitos', () =>
    expect(validarRucEcuador('01234567890123')).toBe(false))

  it('rechaza cadena vacía', () =>
    expect(validarRucEcuador('')).toBe(false))

  // Casos inválidos — formato
  it('rechaza RUC con letras', () =>
    expect(validarRucEcuador('01020304050AB')).toBe(false))

  it('rechaza RUC con guiones', () =>
    expect(validarRucEcuador('010-203040-001')).toBe(false))

  // Casos inválidos — provincia
  it('rechaza provincia 00', () =>
    expect(validarRucEcuador('0002030405001')).toBe(false))

  it('rechaza provincia 25', () =>
    expect(validarRucEcuador('2502030405001')).toBe(false))

  // Casos inválidos — tercer dígito
  it('rechaza tercer dígito 7', () =>
    expect(validarRucEcuador('0172030405001')).toBe(false))

  it('rechaza tercer dígito 8', () =>
    expect(validarRucEcuador('0182030405001')).toBe(false))
})
