'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ComboConAlta } from '@/components/ComboConAlta'

export type DatosTrasladoValor = {
  fecha_inicio_traslado?: string
  fecha_fin_traslado?: string
  punto_partida?: string
  punto_llegada?: string
  motivo?: string
  motivo_otros?: string
  numero_referencia?: string
  comentarios?: string
  cliente_final_id?: string
  punto_entrega_id?: string
  destinatario_nombre?: string
  destinatario_ruc?: string
  transportista_id?: string
  transportista_nombre?: string
  transportista_identificacion?: string
  placa?: string
}

type Cliente = { id: string; nombre: string; ruc?: string | null }
type Punto = { id: string; nombre: string; cliente_final_id: string | null }
type Transportista = { id: string; nombre: string; identificacion: string; placa: string | null }

const MOTIVOS = [
  { v: 'venta', l: 'Venta' }, { v: 'renta', l: 'Renta' }, { v: 'devolucion', l: 'Devolución' },
  { v: 'consignacion', l: 'Consignación' }, { v: 'otros', l: 'Otros' },
]

// Spec: HU-042 CA-04b/CA-09/CA-10/CA-11 — "Datos del traslado". Se usa como borrador en el
// formulario del egreso y como formulario de emisión desde un egreso cerrado.
export function DatosTrasladoForm({
  value, onChange, motivoSugerido, deshabilitado = false,
}: {
  value: DatosTrasladoValor
  onChange: (v: DatosTrasladoValor) => void
  motivoSugerido?: string
  deshabilitado?: boolean
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [transportistas, setTransportistas] = useState<Transportista[]>([])

  function cargarTransportistas() {
    fetch('/api/compras/bodega/transportistas').then((r) => r.json())
      .then((d) => setTransportistas(Array.isArray(d) ? d : [])).catch(() => {})
  }
  useEffect(() => {
    fetch('/api/compras/bodega/clientes-finales?todas=1').then((r) => r.json())
      .then((d) => setClientes(Array.isArray(d) ? d.filter((c: { activo: boolean }) => c.activo) : [])).catch(() => {})
    fetch('/api/compras/bodega/puntos-entrega').then((r) => r.json())
      .then((d) => setPuntos(Array.isArray(d) ? d : [])).catch(() => {})
    cargarTransportistas()
  }, [])

  const set = (parche: DatosTrasladoValor) => onChange({ ...value, ...parche })
  const puntosVisibles = value.cliente_final_id ? puntos.filter((p) => p.cliente_final_id === value.cliente_final_id) : puntos

  function elegirCliente(id: string) {
    const c = clientes.find((x) => x.id === id)
    set({ cliente_final_id: id, punto_entrega_id: '', destinatario_nombre: c?.nombre ?? value.destinatario_nombre, destinatario_ruc: c?.ruc ?? value.destinatario_ruc })
  }
  function elegirPunto(id: string) {
    const p = puntos.find((x) => x.id === id)
    set({ punto_entrega_id: id, punto_llegada: p?.nombre ?? value.punto_llegada })
  }
  function elegirTransportista(id: string) {
    const t = transportistas.find((x) => x.id === id)
    set({
      transportista_id: id,
      transportista_nombre: t?.nombre ?? value.transportista_nombre,
      transportista_identificacion: t?.identificacion ?? value.transportista_identificacion,
      placa: t?.placa ?? value.placa,
    })
  }

  const inp = 'mt-1 h-8 text-sm'
  return (
    <fieldset disabled={deshabilitado} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <Label className="text-xs">Fecha inicio del traslado</Label>
          <Input type="date" value={value.fecha_inicio_traslado ?? ''} onChange={(e) => set({ fecha_inicio_traslado: e.target.value })} className={inp} />
        </div>
        <div>
          <Label className="text-xs">Fecha de terminación</Label>
          <Input type="date" value={value.fecha_fin_traslado ?? ''} onChange={(e) => set({ fecha_fin_traslado: e.target.value })} className={inp} />
        </div>
        <div>
          <Label className="text-xs">Punto de partida</Label>
          <Input value={value.punto_partida ?? ''} onChange={(e) => set({ punto_partida: e.target.value })} placeholder="Por defecto: BASE ARLIFT" className={inp} />
        </div>
        <div>
          <Label className="text-xs">N° de referencia</Label>
          <Input value={value.numero_referencia ?? ''} onChange={(e) => set({ numero_referencia: e.target.value })} className={inp} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs">Motivo del traslado *</Label>
          <select
            value={value.motivo ?? ''}
            onChange={(e) => set({ motivo: e.target.value })}
            className="border rounded px-2 py-1 text-sm w-full h-9 mt-1"
          >
            <option value="">{motivoSugerido ? `— sugerido: ${MOTIVOS.find((m) => m.v === motivoSugerido)?.l ?? motivoSugerido} —` : '— seleccionar —'}</option>
            {MOTIVOS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>
        {value.motivo === 'otros' && (
          <div className="sm:col-span-2">
            <Label className="text-xs">Descripción del motivo *</Label>
            <Input value={value.motivo_otros ?? ''} onChange={(e) => set({ motivo_otros: e.target.value })} className={inp} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border rounded p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-600">DESTINATARIO</p>
          <div>
            <Label className="text-xs">Cliente Final (catálogo, opcional)</Label>
            <select value={value.cliente_final_id ?? ''} onChange={(e) => elegirCliente(e.target.value)} className="border rounded px-2 py-1 text-sm w-full h-9 mt-1">
              <option value="">— digitar manualmente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Nombre / Razón social *</Label>
            <Input value={value.destinatario_nombre ?? ''} onChange={(e) => set({ destinatario_nombre: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-xs">R.U.C / C.I.</Label>
            <Input value={value.destinatario_ruc ?? ''} onChange={(e) => set({ destinatario_ruc: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-xs">Lugar de Entrega (catálogo, opcional)</Label>
            <select value={value.punto_entrega_id ?? ''} onChange={(e) => elegirPunto(e.target.value)} className="border rounded px-2 py-1 text-sm w-full h-9 mt-1">
              <option value="">— digitar manualmente —</option>
              {puntosVisibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Punto de llegada *</Label>
            <Input value={value.punto_llegada ?? ''} onChange={(e) => set({ punto_llegada: e.target.value })} className={inp} />
          </div>
        </div>

        <div className="border rounded p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-600">TRANSPORTISTA</p>
          <ComboConAlta
            label="Transportista (catálogo)"
            value={value.transportista_id ?? ''}
            onChange={elegirTransportista}
            opciones={transportistas.map((t) => ({ id: t.id, nombre: `${t.nombre} — ${t.identificacion}` }))}
            onCreado={() => cargarTransportistas()}
            crearEndpoint="/api/compras/bodega/transportistas"
            construirBody={(nombre, extra) => ({ nombre, identificacion: extra.identificacion, placa: extra.placa || null })}
            placeholderOpcionVacia="— digitar manualmente —"
            camposExtra={[
              { key: 'identificacion', label: 'Cédula / RUC', requerido: true },
              { key: 'placa', label: 'Placa (opcional)' },
            ]}
          />
          <div>
            <Label className="text-xs">Nombre / Razón social *</Label>
            <Input value={value.transportista_nombre ?? ''} onChange={(e) => set({ transportista_nombre: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-xs">R.U.C / C.I. *</Label>
            <Input value={value.transportista_identificacion ?? ''} onChange={(e) => set({ transportista_identificacion: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-xs">Placa del vehículo *</Label>
            <Input value={value.placa ?? ''} onChange={(e) => set({ placa: e.target.value })} className={inp} />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Comentarios</Label>
        <Input value={value.comentarios ?? ''} onChange={(e) => set({ comentarios: e.target.value })} className={inp} />
      </div>
    </fieldset>
  )
}
