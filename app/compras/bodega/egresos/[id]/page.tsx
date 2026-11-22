'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { ProductoSearch } from '@/components/ProductoSearch'
import { AltaProductoRapida } from '@/components/AltaProductoRapida'
import { DatosTrasladoForm, type DatosTrasladoValor } from '@/components/DatosTrasladoForm'

type Linea = {
  id: string; producto_id: string; codigo?: string | null; descripcion?: string | null
  cantidad: number; requiere_guia?: boolean
}
type Documento = {
  id: string
  numero: string
  tipo: string
  estado: string
  override_admin: boolean
  justificacion_override: string | null
  datos_traslado: DatosTrasladoValor | null
  lineas: Linea[]
}
type LineaGuia = {
  egreso_item_id: string; codigo: string; descripcion: string; unidad: string
  cantidad: number; guiado: number; saldo: number; requiere_guia: boolean
}
type GuiasInfo = {
  elegible: boolean
  tipo_admite_guia: boolean
  motivo_sugerido: string
  cliente_final_id: string | null
  punto_entrega_id: string | null
  datos_traslado: DatosTrasladoValor | null
  guias: { id: string; numero: number; estado: string; fecha_inicio_traslado: string; destinatario_nombre: string }[]
  lineas: LineaGuia[]
}

const ESTADO_LABEL: Record<string, string> = { generado: 'Generado', en_validacion: 'En Validación', cerrado: 'Cerrado' }
// Espejo local de TIPOS_EGRESO_CON_GUIA (lib/bodega-guia.ts) — este archivo es 'use client'.
const TIPOS_CON_GUIA = ['venta', 'gasto', 'prestamo']
const numGuia = (n: number) => String(n).padStart(7, '0')

// Spec: HU-030 CA-01/CA-02/CA-03/CA-06 — detalle, edición y cierre del Egreso.
// Spec: HU-042 — "Datos del traslado" (borrador), botón único "Cerrar y generar guía" y
// guías del egreso (emisión posterior para viajes adicionales).
export default function DetalleEgresoPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Documento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [lineasEdit, setLineasEdit] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [mostrarOverride, setMostrarOverride] = useState(false)
  const [justificacion, setJustificacion] = useState('')
  // Spec: HU-037 — etiqueta de Tipo desde el catálogo (reemplaza el mapeo
  // hardcodeado), mismo criterio que ingresos/[id]/page.tsx.
  const [tiposEgreso, setTiposEgreso] = useState<{ codigo: string; nombre: string }[]>([])
  const [traslado, setTraslado] = useState<DatosTrasladoValor>({})
  const [guiasInfo, setGuiasInfo] = useState<GuiasInfo | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [mostrarEmision, setMostrarEmision] = useState(false)
  const [emisionLineas, setEmisionLineas] = useState<Record<string, { marcada: boolean; cantidad: number }>>({})

  function cargar() {
    setCargando(true)
    // Evita pintar la sección de guías con datos anteriores al cierre mientras recarga.
    setGuiasInfo(null)
    fetch(`/api/compras/bodega/egresos/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data); setLineasEdit(data?.lineas ?? []); setTraslado(data?.datos_traslado ?? {}); setCargando(false)
      })
      .catch(() => setCargando(false))
    fetch(`/api/compras/bodega/egresos/${id}/guias`)
      .then((r) => r.json())
      .then((g) => { if (!g?.error) setGuiasInfo(g) })
      .catch(() => {})
  }
  useEffect(() => { if (id) cargar() }, [id])
  useEffect(() => {
    fetch('/api/compras/bodega/tipos-egreso').then((r) => r.json()).then((d) => setTiposEgreso(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const editable = doc && ['generado', 'en_validacion'].includes(doc.estado)
  const admiteGuia = !!doc && TIPOS_CON_GUIA.includes(doc.tipo)
  const hayLineaConGuia = lineasEdit.some((l) => l.requiere_guia !== false)
  const cierraConGuia = !!editable && admiteGuia && hayLineaConGuia

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string | number | boolean | null) {
    setLineasEdit((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }
  function eliminarLinea(idx: number) { setLineasEdit((prev) => prev.filter((_, i) => i !== idx)) }
  function agregarLinea() { setLineasEdit((prev) => [...prev, { id: '', producto_id: '', codigo: '', descripcion: '', cantidad: 0 }]) }

  async function guardarBorrador(): Promise<boolean> {
    const res = await fetch(`/api/compras/bodega/egresos/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineas: lineasEdit, ...(admiteGuia ? { datos_traslado: traslado } : {}) }),
    })
    if (!res.ok) { const data = await res.json(); toast.error(data.error ?? 'Error al guardar'); return false }
    return true
  }

  async function handleGuardar() {
    setGuardando(true)
    try {
      if (await guardarBorrador()) { toast.success('Documento de Egreso actualizado'); cargar() }
    } finally { setGuardando(false) }
  }

  async function handleCerrar(conOverride: boolean) {
    setCerrando(true)
    try {
      // Spec: HU-042 CA-04c — con guía, primero se persisten líneas y borrador de traslado.
      if (cierraConGuia && !(await guardarBorrador())) return
      const res = await fetch(`/api/compras/bodega/egresos/${id}/cerrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(conOverride ? { override: true, justificacion } : {}), ...(cierraConGuia ? { emitir_guia: true } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.lineas_excedidas?.length) {
          toast.error(`Saldo insuficiente: ${data.lineas_excedidas.join(', ')}`)
          setMostrarOverride(true)
        } else {
          toast.error(data.error ?? 'Error al cerrar')
        }
        return
      }
      setMostrarOverride(false)
      if (data.guia) {
        toast.success(`Documento cerrado — Guía de remisión N° ${numGuia(data.guia.numero)} emitida`)
        window.open(`/api/compras/bodega/guias/${data.guia.id}/pdf`, '_blank')
      } else if (data.guia_error) {
        toast.error(`Documento cerrado, pero la guía no se emitió: ${data.guia_error}. Puedes generarla desde esta pantalla.`)
      } else {
        toast.success('Documento cerrado — Kardex generado')
      }
      cargar()
    } finally { setCerrando(false) }
  }

  function abrirEmision() {
    if (!guiasInfo) return
    const pendientes: Record<string, { marcada: boolean; cantidad: number }> = {}
    for (const l of guiasInfo.lineas) pendientes[l.egreso_item_id] = { marcada: l.requiere_guia && l.saldo > 0, cantidad: l.saldo }
    setEmisionLineas(pendientes)
    setTraslado((prev) => ({
      motivo: guiasInfo.motivo_sugerido,
      cliente_final_id: guiasInfo.cliente_final_id ?? '',
      punto_entrega_id: guiasInfo.punto_entrega_id ?? '',
      ...(guiasInfo.datos_traslado ?? {}),
      ...prev,
    }))
    setMostrarEmision(true)
  }

  async function handleEmitir() {
    const lineas = Object.entries(emisionLineas)
      .filter(([, v]) => v.marcada && v.cantidad > 0)
      .map(([egreso_item_id, v]) => ({ egreso_item_id, cantidad: v.cantidad }))
    if (lineas.length === 0) { toast.error('Selecciona al menos una línea'); return }
    setEmitiendo(true)
    try {
      const res = await fetch(`/api/compras/bodega/egresos/${id}/guias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...traslado, lineas }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al emitir la guía'); return }
      toast.success(`Guía de remisión N° ${numGuia(data.numero)} emitida`)
      window.open(`/api/compras/bodega/guias/${data.guia_id}/pdf`, '_blank')
      setMostrarEmision(false)
      cargar()
    } finally { setEmitiendo(false) }
  }

  if (cargando) return <div className="p-6">Cargando...</div>
  if (!doc) return <div className="p-6">Documento no encontrado.</div>

  const saldoTotal = guiasInfo?.lineas.reduce((a, l) => a + (l.requiere_guia ? l.saldo : 0), 0) ?? 0

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Documento de Egreso {doc.numero}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Tipo:</strong> {tiposEgreso.find((t) => t.codigo === doc.tipo)?.nombre ?? doc.tipo}</p>
          <p><strong>Estado:</strong> {ESTADO_LABEL[doc.estado] ?? doc.estado}</p>
          {doc.override_admin && (
            <p className="text-red-600"><strong>Cerrado con override de saldo:</strong> {doc.justificacion_override}</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Líneas</CardTitle>
          {editable && <Button size="sm" onClick={agregarLinea}>+ Agregar línea</Button>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Producto</th>
                  <th className="p-2">Cantidad</th>
                  {admiteGuia && <th className="p-2">¿Va en guía?</th>}
                  {editable && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody>
                {lineasEdit.map((l, idx) => (
                  <tr key={l.id || idx} className="border-b">
                    <td className="p-2 min-w-[260px]">
                      {editable ? (
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <ProductoSearch
                              value={l.codigo ?? ''}
                              onChange={(val) => { actualizarLinea(idx, 'codigo', val); actualizarLinea(idx, 'producto_id', '') }}
                              onSelect={(item) => {
                                actualizarLinea(idx, 'producto_id', item.id)
                                actualizarLinea(idx, 'codigo', item.codigo)
                                actualizarLinea(idx, 'descripcion', item.descripcion)
                                // Spec: HU-042 CA-02 — la línea hereda el valor del producto.
                                actualizarLinea(idx, 'requiere_guia', item.requiere_guia !== false)
                              }}
                            />
                            {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                          </div>
                          <AltaProductoRapida onCreado={(item) => {
                            actualizarLinea(idx, 'producto_id', item.id)
                            actualizarLinea(idx, 'codigo', item.codigo)
                            actualizarLinea(idx, 'descripcion', item.descripcion)
                          }} />
                        </div>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-slate-400 mr-1">{l.codigo ?? l.producto_id}</span>
                          {l.descripcion}
                        </>
                      )}
                    </td>
                    <td className="p-2 w-24">
                      {editable ? (
                        <Input type="number" value={l.cantidad} onChange={(e) => actualizarLinea(idx, 'cantidad', Number(e.target.value))} />
                      ) : l.cantidad}
                    </td>
                    {admiteGuia && (
                      <td className="p-2 w-28">
                        {editable ? (
                          <input
                            type="checkbox"
                            checked={l.requiere_guia !== false}
                            onChange={(e) => actualizarLinea(idx, 'requiere_guia', e.target.checked)}
                            aria-label="Va en guía de remisión"
                          />
                        ) : (l.requiere_guia === false ? 'No' : 'Sí')}
                      </td>
                    )}
                    {editable && (
                      <td className="p-2">
                        <button onClick={() => eliminarLinea(idx)} className="text-red-600 text-xs hover:underline">Eliminar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="space-y-3 mt-4">
              <div className="flex gap-2">
                <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar Cambios'}</Button>
                <Button onClick={() => handleCerrar(false)} disabled={cerrando} className="bg-green-700 hover:bg-green-800">
                  {cerrando ? 'Cerrando...' : cierraConGuia ? 'Cerrar y generar guía' : 'Cerrar y Egresar de Bodega'}
                </Button>
              </div>
              {mostrarOverride && (
                <div className="border border-red-300 rounded p-3 bg-red-50 space-y-2">
                  <p className="text-sm text-red-700">Saldo insuficiente — solo un rol admin puede forzar el cierre con justificación.</p>
                  <Input placeholder="Justificación del override" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
                  <Button size="sm" onClick={() => handleCerrar(true)} disabled={cerrando || !justificacion.trim()} className="bg-red-700 hover:bg-red-800">
                    Forzar cierre con override (solo admin)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {editable && admiteGuia && (
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Datos del traslado (guía de remisión)</CardTitle>
            <p className="text-xs text-slate-500">
              Borrador opcional. Si hay líneas que van en guía, al cerrar el egreso se emite la guía con estos datos y
              se asigna el número en ese momento.
            </p>
          </CardHeader>
          <CardContent>
            <DatosTrasladoForm value={traslado} onChange={setTraslado} motivoSugerido={guiasInfo?.motivo_sugerido} />
          </CardContent>
        </Card>
      )}

      {doc.estado === 'cerrado' && guiasInfo && (
        <Card className="overflow-visible">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Guías de remisión</CardTitle>
            {guiasInfo.elegible && saldoTotal > 0 && !mostrarEmision && (
              <Button size="sm" onClick={abrirEmision}>+ Generar guía</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!guiasInfo.tipo_admite_guia ? (
              <p className="text-sm text-slate-500">Este tipo de egreso no admite guía de remisión.</p>
            ) : guiasInfo.guias.length === 0 ? (
              <p className="text-sm text-slate-500">Este egreso aún no tiene guías.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">N°</th><th className="p-2">Fecha</th><th className="p-2">Destinatario</th><th className="p-2">Estado</th></tr></thead>
                <tbody>
                  {guiasInfo.guias.map((g) => (
                    <tr key={g.id} className="border-b">
                      <td className="p-2"><Link href={`/compras/bodega/guias/${g.id}`} className="text-blue-600 hover:underline font-mono">{numGuia(g.numero)}</Link></td>
                      <td className="p-2">{g.fecha_inicio_traslado}</td>
                      <td className="p-2">{g.destinatario_nombre}</td>
                      <td className="p-2">{g.estado === 'anulada' ? <span className="text-red-600">Anulada</span> : 'Emitida'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {guiasInfo.elegible && saldoTotal === 0 && guiasInfo.guias.some((g) => g.estado === 'emitida') && (
              <p className="text-xs text-slate-500">Todas las líneas que van en guía ya están cubiertas.</p>
            )}

            {mostrarEmision && (
              <div className="border rounded p-4 space-y-4 bg-slate-50">
                <p className="text-sm font-semibold">Nueva guía de remisión</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2"></th><th className="p-2">Producto</th><th className="p-2">Unidad</th><th className="p-2">Saldo por guiar</th><th className="p-2">Cantidad en esta guía</th></tr></thead>
                  <tbody>
                    {guiasInfo.lineas.filter((l) => l.saldo > 0).map((l) => (
                      <tr key={l.egreso_item_id} className="border-b">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={emisionLineas[l.egreso_item_id]?.marcada ?? false}
                            onChange={(e) => setEmisionLineas((p) => ({ ...p, [l.egreso_item_id]: { ...p[l.egreso_item_id], marcada: e.target.checked } }))}
                          />
                        </td>
                        <td className="p-2"><span className="font-mono text-xs text-slate-400 mr-1">{l.codigo}</span>{l.descripcion}{!l.requiere_guia && <span className="ml-2 text-xs text-amber-600">(marcada "no va en guía")</span>}</td>
                        <td className="p-2">{l.unidad}</td>
                        <td className="p-2">{l.saldo}</td>
                        <td className="p-2 w-32">
                          <Input
                            type="number" min={0} max={l.saldo}
                            value={emisionLineas[l.egreso_item_id]?.cantidad ?? 0}
                            onChange={(e) => setEmisionLineas((p) => ({ ...p, [l.egreso_item_id]: { ...p[l.egreso_item_id], cantidad: Number(e.target.value) } }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <DatosTrasladoForm value={traslado} onChange={setTraslado} motivoSugerido={guiasInfo.motivo_sugerido} />
                <div className="flex gap-2">
                  <Button onClick={handleEmitir} disabled={emitiendo} className="bg-green-700 hover:bg-green-800">
                    {emitiendo ? 'Emitiendo...' : 'Emitir guía'}
                  </Button>
                  <Button variant="outline" onClick={() => setMostrarEmision(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
