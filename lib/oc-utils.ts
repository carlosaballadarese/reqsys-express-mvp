export function resolverEtiquetaAprobador(rol: string | null): { titulo: string; cargo: string } {
  switch (rol) {
    case 'compras':  return { titulo: 'COORDINADOR DE COMPRAS',    cargo: 'Coordinador de Compras' }
    case 'gerencia': return { titulo: 'GERENTE GENERAL',           cargo: 'Gerente General' }
    case 'admin':    return { titulo: 'ADMINISTRADOR DEL SISTEMA', cargo: 'Administrador del Sistema' }
    default:         return { titulo: 'COORDINADOR DE COMPRAS / GERENTE GENERAL',
                              cargo: 'Coordinador de Compras / Gerente General' }
  }
}
