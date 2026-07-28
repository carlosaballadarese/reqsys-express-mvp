// Spec: SC-001 RN-05 — todo firmante de OC vinculado a Compras (Elaborado,
// Aprobación de Compra) usa esta Área fija; solo compras/admin/asistente_compras
// pueden crear/aprobar OCs, así que no requiere una columna de base de datos.
export const AREA_COMPRAS_FIJA = 'Compras'

export function resolverEtiquetaAprobador(rol: string | null): { titulo: string; cargo: string } {
  switch (rol) {
    case 'compras':  return { titulo: 'COORDINADOR DE COMPRAS',    cargo: 'Coordinador de Compras' }
    case 'gerencia': return { titulo: 'GERENTE GENERAL',           cargo: 'Gerente General' }
    case 'admin':    return { titulo: 'ADMINISTRADOR DEL SISTEMA', cargo: 'Administrador del Sistema' }
    default:         return { titulo: 'COORDINADOR DE COMPRAS / GERENTE GENERAL',
                              cargo: 'Coordinador de Compras / Gerente General' }
  }
}
