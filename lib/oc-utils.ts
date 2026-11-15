// Spec: SC-001 RN-05 — todo firmante de OC vinculado a Compras (Elaborado,
// Aprobación de Compra) usa esta Área fija; solo compras/admin/asistente_compras
// pueden crear/aprobar OCs, así que no requiere una columna de base de datos.
export const AREA_COMPRAS_FIJA = 'Compras'

// Spec: SC-016 Decisión 1 — fallback de presentación cuando numero_oc es
// null (OC en_proceso, numeración diferida a la emisión). Nunca afecta
// navegación: todo Link/href de OC ya usa oc.id, nunca numero_oc.
export function formatNumeroOc(numero: string | null | undefined): string {
  return numero ?? '— sin asignar —'
}

export function resolverEtiquetaAprobador(rol: string | null): { titulo: string; cargo: string } {
  switch (rol) {
    case 'compras':  return { titulo: 'COORDINADOR DE COMPRAS',    cargo: 'Coordinador de Compras' }
    case 'gerencia': return { titulo: 'GERENTE GENERAL',           cargo: 'Gerente General' }
    case 'admin':    return { titulo: 'ADMINISTRADOR DEL SISTEMA', cargo: 'Administrador del Sistema' }
    default:         return { titulo: 'COORDINADOR DE COMPRAS / GERENTE GENERAL',
                              cargo: 'Coordinador de Compras / Gerente General' }
  }
}
