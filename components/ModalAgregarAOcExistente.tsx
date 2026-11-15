'use client'

// Spec: SC-017 — "Agregar a OC existente" (Mejora 4, segunda mitad del
// documento fuente). Es la misma fusión LineaPendiente -> ItemOC que
// SelectorLineasNPModal.tsx (SC-016) ya diseñó, vista desde el lado
// contrario: aquí se elige la OC DESTINO (no las líneas), y la OC ya tiene
// proveedor fijo. No duplica ninguna validación de negocio — delega 100%
// en el PUT /api/compras/ordenes/[id] ya existente.

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNumeroOc } from '@/lib/oc-utils'

type LineaPendiente = {
  item_id: string
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  cantidad_total: number
  proveedor_sugerido: string | null
  precio_unitario: number | null
}

type OCDestino = {
  id: string
  numero_oc: string | null
  proveedor: string
  created_at: string
  valor_total: number
  items_count?: number
}

type ItemOCExistente = {
  item_np_id: string | null
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  tipo: string | null
  informacion_adicional: string | null
  fecha_entrega: string | null
  justificacion_cantidad: string | null
}

function normaliza(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase()
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC')
}

export function ModalAgregarAOcExistente({
  lineas,
  onClose,
  onAgregado,
}: {
  lineas: LineaPendiente[]
  onClose: () => void
  onAgregado: (ocId: string) => void
}) {
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [ocs, setOcs]               = useState<OCDestino[]>([])
  const [cargando, setCargando]     = useState(true)
  const [ocSeleccionada, setOcSeleccionada] = useState<OCDestino | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Spec RN-02 — proveedor sugerido común entre las líneas (vacío si no hay
  // uno único no vacío compartido por todas — mismo criterio que ModalGenerarOC).
  const proveedorSugeridoComun = useMemo(() => {
    const valores = new Set(lineas.map(l => normaliza(l.proveedor_sugerido)).filter(v => v !== ''))
    return valores.size === 1 ? [...valores][0] : null
  }, [lineas])

  function buscar() {
    setCargando(true)
    setError(null)
    const params = new URLSearchParams({ estado: 'en_proceso' })
    if (filtroProveedor.trim()) params.set('proveedor', filtroProveedor.trim())
    fetch(`/api/compras/ordenes?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: OCDestino[]) => {
        // Spec RN-02 — reordenamiento, no filtro exclusivo (Decisión de diseño 3):
        // las OCs cuyo proveedor coincide con el sugerido común aparecen primero,
        // conservando el orden created_at desc ya devuelto por el backend dentro
        // de cada grupo.
        const ordenadas = proveedorSugeridoComun
          ? [...data].sort((a, b) => {
              const aMatch = normaliza(a.proveedor) === proveedorSugeridoComun ? 0 : 1
              const bMatch = normaliza(b.proveedor) === proveedorSugeridoComun ? 0 : 1
              return aMatch - bMatch
            })
          : data
        setOcs(Array.isArray(ordenadas) ? ordenadas : [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  useEffect(() => { buscar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Spec CA-05/CA-06/RN-03 — líneas cuyo proveedor_sugerido (no vacío) difiere
  // del proveedor de la OC elegida; no bloquea, solo advierte.
  const lineasConProveedorDistinto = ocSeleccionada
    ? lineas.filter(l => {
        const sug = normaliza(l.proveedor_sugerido)
        return sug !== '' && sug !== normaliza(ocSeleccionada.proveedor)
      })
    : []

  async function confirmar() {
    if (!ocSeleccionada) return
    setConfirmando(true)
    setError(null)
    try {
      const resGet = await fetch(`/api/compras/ordenes/${ocSeleccionada.id}`)
      const data = await resGet.json()
      if (!resGet.ok || !data.oc) {
        setError('No se pudo cargar la OC destino — puede haber sido eliminada o cambiado de estado.')
        return
      }
      const oc = data.oc
      const itemsExistentes: ItemOCExistente[] = (data.items ?? []).map((it: {
        item_np_id: string | null; codigo: string | null; descripcion: string; unidad: string
        cantidad: number; precio_unitario: number; tipo: string | null
        informacion_adicional: string | null; fecha_entrega: string | null
        justificacion_cantidad: string | null
      }) => ({
        item_np_id:             it.item_np_id,
        codigo:                 it.codigo,
        descripcion:            it.descripcion,
        unidad:                 it.unidad,
        cantidad:               it.cantidad,
        precio_unitario:        it.precio_unitario,
        tipo:                   it.tipo,
        informacion_adicional:  it.informacion_adicional,
        fecha_entrega:          it.fecha_entrega,
        justificacion_cantidad: it.justificacion_cantidad,
      }))

      const itemsNuevos = lineas.map(l => ({
        item_np_id:             l.item_id,
        codigo:                 l.codigo,
        descripcion:            l.descripcion,
        unidad:                 l.unidad,
        cantidad:               l.cantidad,
        precio_unitario:        l.precio_unitario ?? 0,
        tipo:                   null,
        informacion_adicional:  null,
        fecha_entrega:          null,
        // Spec: SC-012/HU-003 — justificación requerida cuando la cantidad
        // agregada (saldo disponible) difiere del total original de la línea.
        justificacion_cantidad: l.cantidad_total > l.cantidad
          ? `Saldo disponible tras cobertura parcial previa (${l.cantidad} de ${l.cantidad_total})`
          : null,
      }))

      const itemsFusionados = [...itemsExistentes, ...itemsNuevos]
      const valorTotal = itemsFusionados.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0
      )

      const resPut = await fetch(`/api/compras/ordenes/${ocSeleccionada.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id:         oc.proveedor_id,
          fecha_oc:             oc.fecha_oc,
          descripcion_oc:       oc.descripcion_oc,
          area:                 oc.area,
          tipo_compra:          oc.tipo_compra,
          centro_costo:         oc.centro_costo,
          numero_factura:       oc.numero_factura,
          fecha_factura:        oc.fecha_factura,
          valor_total:          valorTotal,
          valor_retenido:       oc.valor_retenido,
          tipo_pago:            oc.tipo_pago,
          banco:                oc.banco,
          dias_credito:         oc.dias_credito,
          fecha_vencimiento:    oc.fecha_vencimiento,
          mes_pago:             oc.mes_pago,
          numero_cotizacion:    oc.numero_cotizacion,
          condiciones_minimas:  oc.condiciones_minimas,
          items:                itemsFusionados,
        }),
      })
      const putData = await resPut.json()
      if (!resPut.ok) {
        // Spec: CA-08 — mensaje específico cuando la OC destino tiene ítems
        // manuales sin NP de origen (HU-003 CA-02, regla ya existente).
        if (putData.error === 'item_sin_enlace_np') {
          setError('Esta OC tiene ítems sin NP de origen que no se pueden mezclar con líneas de NP en la misma OC.')
        } else if (putData.error === 'sobrecompra') {
          setError(putData.message ?? 'La cantidad supera el saldo disponible en una o más NPs.')
        } else if (resPut.status === 409) {
          setError('Esta OC ya no está en estado En proceso — elige otra o recarga la lista.')
        } else if (resPut.status === 403) {
          setError('Solo puedes agregar líneas a OCs que tú generaste.')
        } else {
          setError(putData.error ?? 'Error al agregar las líneas a la OC.')
        }
        return
      }
      onAgregado(ocSeleccionada.id)
    } catch {
      setError('Error de red al agregar las líneas.')
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-base">Agregar a OC existente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600">Filtrar por proveedor</label>
              <Input
                value={filtroProveedor}
                onChange={e => setFiltroProveedor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="(vacío = todos los proveedores)"
              />
            </div>
            <Button variant="outline" onClick={buscar} className="h-9">Buscar</Button>
          </div>

          <div className="overflow-x-auto max-h-72">
            {cargando ? (
              <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
            ) : ocs.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No hay OCs en proceso con este filtro.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-xs uppercase">
                    <th className="py-2 pr-2"></th>
                    <th className="text-left py-2 pr-3">N° OC</th>
                    <th className="text-left py-2 pr-3">Proveedor</th>
                    <th className="text-left py-2 pr-3">Creación</th>
                    <th className="text-right py-2 pr-3">Líneas</th>
                    <th className="text-right py-2 pr-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ocs.map(oc => (
                    <tr
                      key={oc.id}
                      data-oc-id={oc.id}
                      className={`border-b cursor-pointer hover:bg-slate-50 ${ocSeleccionada?.id === oc.id ? 'bg-amber-50' : ''}`}
                      onClick={() => setOcSeleccionada(oc)}
                    >
                      <td className="py-2 pr-2">
                        <input type="radio" checked={ocSeleccionada?.id === oc.id} onChange={() => setOcSeleccionada(oc)} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{formatNumeroOc(oc.numero_oc)}</td>
                      <td className="py-2 pr-3">{oc.proveedor}</td>
                      <td className="py-2 pr-3">{fechaCorta(oc.created_at)}</td>
                      <td className="py-2 pr-3 text-right">{oc.items_count ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">${Number(oc.valor_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Spec CA-05/RN-03 — advertencia no bloqueante */}
          {ocSeleccionada && lineasConProveedorDistinto.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ {lineasConProveedorDistinto.length} línea(s) tienen un proveedor sugerido distinto al de esta OC
              ({ocSeleccionada.proveedor}) — el proveedor sugerido es referencial, puedes continuar.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={confirmando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!ocSeleccionada || confirmando} className="btn-primary">
              {confirmando ? 'Agregando...' : 'Confirmar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
