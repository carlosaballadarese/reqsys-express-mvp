import { adminClient } from '@/lib/supabase/clients'

// Spec: HU-040 — capa de consulta para los 7 reportes de catálogo, reutiliza
// ROLES_REPORTES_BODEGA de lib/bodega-reportes-query.ts (no se redefine).
export { ROLES_REPORTES_BODEGA } from '@/lib/bodega-reportes-query'

export type FilaBodega = { codigo: string; nombre: string; activo: boolean }
export type FilaCategoria = { nombre: string; activo: boolean; areas: string[] }
export type FilaClienteFinal = { nombre: string; ruc: string | null; activo: boolean }
export type FilaPuntoEntrega = { nombre: string; clienteFinalNombre: string | null; activo: boolean }
export type FilaTipoMovimiento = { codigo: string; nombre: string; activo: boolean }
export type FilaProveedor = {
  nombre: string; ruc: string | null; clasificacion: string | null; categoria: string | null
  ciudad: string | null; giroNegocio: string | null; direccion: string | null
  telefono: string | null; email: string | null; contacto: string | null; activo: boolean
}

// Spec: HU-040 CA-08 — todos los reportes de catálogo incluyen inactivos.
export async function obtenerBodegasReporte(): Promise<FilaBodega[]> {
  const { data } = await adminClient().from('bodegas').select('codigo, nombre, activo').order('codigo')
  return data ?? []
}

export async function obtenerCategoriasReporte(): Promise<FilaCategoria[]> {
  const { data: categorias } = await adminClient().from('categorias').select('id, nombre, activo').order('nombre')
  const { data: cruces } = await adminClient().from('area_categoria_bodega').select('categoria_id, area_id')
  const { data: areas } = await adminClient().from('areas').select('id, nombre')

  const nombreAreaPorId = new Map((areas ?? []).map(a => [a.id, a.nombre]))
  const areasPorCategoria = new Map<string, string[]>()
  for (const c of cruces ?? []) {
    const lista = areasPorCategoria.get(c.categoria_id) ?? []
    const nombreArea = nombreAreaPorId.get(c.area_id)
    if (nombreArea) lista.push(nombreArea)
    areasPorCategoria.set(c.categoria_id, lista)
  }

  return (categorias ?? []).map(c => ({
    nombre: c.nombre,
    activo: c.activo,
    areas: (areasPorCategoria.get(c.id) ?? []).sort(),
  }))
}

export async function obtenerClientesFinalesReporte(): Promise<FilaClienteFinal[]> {
  const { data } = await adminClient().from('clientes_finales').select('nombre, ruc, activo').order('nombre')
  return data ?? []
}

export async function obtenerPuntosEntregaReporte(): Promise<FilaPuntoEntrega[]> {
  const { data: puntos } = await adminClient().from('puntos_entrega').select('nombre, cliente_final_id, activo').order('nombre')
  const { data: clientes } = await adminClient().from('clientes_finales').select('id, nombre')
  const nombrePorId = new Map((clientes ?? []).map(c => [c.id, c.nombre]))

  return (puntos ?? []).map(p => ({
    nombre: p.nombre,
    clienteFinalNombre: p.cliente_final_id ? (nombrePorId.get(p.cliente_final_id) ?? null) : null,
    activo: p.activo,
  }))
}

export async function obtenerTiposIngresoReporte(): Promise<FilaTipoMovimiento[]> {
  const { data } = await adminClient().from('tipos_ingreso').select('codigo, nombre, activo').order('nombre')
  return data ?? []
}

export async function obtenerTiposEgresoReporte(): Promise<FilaTipoMovimiento[]> {
  const { data } = await adminClient().from('tipos_egreso').select('codigo, nombre, activo').order('nombre')
  return data ?? []
}

export async function obtenerProveedoresReporte(): Promise<FilaProveedor[]> {
  const { data } = await adminClient()
    .from('proveedores')
    .select('nombre, ruc, clasificacion, categoria, ciudad, giro_negocio, direccion, telefono, email, contacto, activo')
    .order('nombre')
  return (data ?? []).map(p => ({
    nombre: p.nombre, ruc: p.ruc, clasificacion: p.clasificacion, categoria: p.categoria,
    ciudad: p.ciudad, giroNegocio: p.giro_negocio, direccion: p.direccion,
    telefono: p.telefono, email: p.email, contacto: p.contacto, activo: p.activo,
  }))
}
