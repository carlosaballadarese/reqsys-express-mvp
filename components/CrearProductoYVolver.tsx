'use client'

import { useRouter } from 'next/navigation'
import { guardarDraftProducto } from '@/lib/bodega-draft-producto'

// Spec: hallazgo real de usuario (2026-11-22) — reemplaza AltaProductoRapida
// (mini-formulario inline de solo código+descripción, confuso según el
// usuario) por navegación real a /compras/inventario/nuevo (la pantalla
// completa, con bodega/categoría/stock/etc.), guardando antes el borrador
// del formulario actual para restaurarlo al volver, sin perder nada de lo
// ya ingresado. `draft` es el estado completo del formulario de origen
// (serializable a JSON); `lineaIdx` identifica qué línea debe recibir el
// producto recién creado al volver.
export function CrearProductoYVolver({
  draftKey,
  draft,
  lineaIdx,
  volverA,
}: {
  draftKey: string
  draft: unknown
  lineaIdx: number | string
  volverA: string
}) {
  const router = useRouter()

  function ir() {
    guardarDraftProducto(draftKey, draft, lineaIdx)
    const params = new URLSearchParams({ volver: volverA, volverDraft: draftKey })
    router.push(`/compras/inventario/nuevo?${params.toString()}`)
  }

  return (
    <button
      type="button"
      onClick={ir}
      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
    >
      + Crear producto nuevo
    </button>
  )
}
