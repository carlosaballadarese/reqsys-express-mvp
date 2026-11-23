// Spec: HU-037 CA-04 — tipo compartido por los 4 endpoints nuevos
// (tipos-ingreso, tipos-egreso). Sin lógica de negocio propia: los endpoints
// son select/update directos, igual de simples que bodegas/route.ts.
export type TipoCatalogo = { id: string; codigo: string; nombre: string; activo: boolean }
