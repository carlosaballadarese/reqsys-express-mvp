// Spec: hallazgo real de usuario (2026-11-22) — reemplaza el alta rápida
// inline (AltaProductoRapida, HU-037) por un viaje de ida y vuelta a la
// pantalla completa de "Nuevo Ítem de Inventario", sin perder el borrador
// del documento de Bodega (Ingreso/Egreso/Ensamblaje) que se estaba
// completando. El borrador se guarda en sessionStorage (nunca en servidor:
// es estado efímero de un formulario no guardado) bajo una clave propia
// por pantalla, y se consume una sola vez al volver.
const PREFIJO = 'bodega-draft-producto:'

export function guardarDraftProducto(clave: string, draft: unknown, lineaIdx: number | string) {
  try {
    sessionStorage.setItem(PREFIJO + clave, JSON.stringify({ draft, lineaIdx }))
  } catch {
    // sessionStorage puede fallar (modo privado, cuota excedida) — degradar
    // sin romper la navegación; el usuario simplemente no recupera el borrador.
  }
}

export function leerDraftProducto<T>(clave: string): { draft: T; lineaIdx: number | string } | null {
  try {
    const raw = sessionStorage.getItem(PREFIJO + clave)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function limpiarDraftProducto(clave: string) {
  try {
    sessionStorage.removeItem(PREFIJO + clave)
  } catch {
    // nada que limpiar si sessionStorage no está disponible
  }
}
