// Spec: SC-001 — promovido desde app/compras/accesos/page.tsx para reutilizarse
// también en la exportación PDF/Excel de NP (campo "Rol" del solicitante).
export const ROL_LABEL: Record<string, string> = {
  solicitante:       'Solicitante',
  bodega:            'Bodega',
  coordinador:       'Coordinador',
  asistente_compras: 'Asistente Compras',
  compras:           'Compras',
  gerencia:          'Gerencia',
  consulta:          'Consulta',
  admin:             'Administrador',
}
