'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { ComboConAlta } from '@/components/ComboConAlta'
import { ProductoSearch } from '@/components/ProductoSearch'
import { CrearProductoYVolver } from '@/components/CrearProductoYVolver'
import { leerDraftProducto, limpiarDraftProducto } from '@/lib/bodega-draft-producto'

type Bodega = { id: string; nombre: string }
type Linea = { producto_id: string; codigo: string; descripcion: string; cantidad: number }
type Draft = { bodegaId: string; insumos: Linea[]; resultados: Linea[] }

const RUTA = '/compras/bodega/ensamblajes/nuevo'
const DRAFT_KEY = 'ensamblaje-nuevo'

// Fix: hallazgo real (2026-11-22) — esta función tomaba `lista` como
// parámetro y llamaba a `setLista(lista.map(...))` con un valor plano, no
// con la forma funcional (prev => ...). El onSelect de ProductoSearch llama
// a esta función 3 veces seguidas para la misma línea (producto_id, codigo,
// descripcion); como las 3 llamadas comparten el mismo `lista` obsoleto
// (capturado una sola vez en el cierre del evento), solo el ÚLTIMO campo
// escrito sobrevivía — producto_id y codigo quedaban revertidos a su valor
// original vacío. Resultado real: nunca era posible vincular un producto
// seleccionándolo del buscador en esta pantalla. Con la forma funcional,
// cada llamada se encadena sobre el estado más reciente, sin importar
// cuántas veces se invoque seguida dentro del mismo handler.
function actualizar(setLista: Dispatch<SetStateAction<Linea[]>>, idx: number, campo: keyof Linea, valor: string | number) {
  setLista((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
}

// Fix: hallazgo real (2026-11-22) — esta tabla vivía declarada DENTRO del
// cuerpo de NuevoEnsamblajePage ("function TablaLineas() {...}" en el
// render). Eso le da una identidad de componente NUEVA en cada re-render
// del padre (cada tecleo en el buscador de producto dispara un setState,
// que re-renderiza el padre, que vuelve a declarar la función) — React la
// trata como un tipo de componente distinto y desmonta/remonta todo el
// subárbol en cada tecla, perdiendo el valor recién tipeado. Síntoma real:
// era imposible escribir en el buscador de Producto o en Cantidad dentro de
// esta pantalla. Hoisteada a nivel de módulo, con todo lo que necesita
// recibido por props, para que conserve su identidad entre renders.
function TablaLineas({
  titulo, tabla, lineas, setLineas, bodegaId, insumos, resultados,
}: {
  titulo: string
  tabla: 'insumos' | 'resultados'
  lineas: Linea[]
  setLineas: Dispatch<SetStateAction<Linea[]>>
  bodegaId: string
  insumos: Linea[]
  resultados: Linea[]
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{titulo}</Label>
        <Button size="sm" onClick={() => setLineas((prev) => [...prev, { producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])}>+ Agregar línea</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Cantidad</th><th className="p-2"></th></tr></thead>
        <tbody>
          {lineas.map((l, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-2 min-w-[260px]">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <ProductoSearch
                      value={l.codigo}
                      onChange={(val) => { actualizar(setLineas, idx, 'codigo', val); actualizar(setLineas, idx, 'producto_id', '') }}
                      onSelect={(item) => {
                        actualizar(setLineas, idx, 'producto_id', item.id)
                        actualizar(setLineas, idx, 'codigo', item.codigo)
                        actualizar(setLineas, idx, 'descripcion', item.descripcion)
                      }}
                    />
                    {l.descripcion && <p className="text-xs text-slate-500 mt-0.5">{l.descripcion}</p>}
                  </div>
                  <CrearProductoYVolver
                    draftKey={DRAFT_KEY}
                    draft={{ bodegaId, insumos, resultados }}
                    lineaIdx={`${tabla}:${idx}`}
                    volverA={RUTA}
                  />
                </div>
              </td>
              <td className="p-2 w-24"><Input type="number" value={l.cantidad} onChange={(e) => actualizar(setLineas, idx, 'cantidad', Number(e.target.value))} /></td>
              <td className="p-2">
                {lineas.length > 1 && <button onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 text-xs hover:underline">Eliminar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Spec: HU-031 CA-01 — creación de Orden de Ensamblaje (insumos + resultados en la misma orden).
export default function NuevoEnsamblajePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bodegaId, setBodegaId] = useState('')
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [insumos, setInsumos] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])
  const [resultados, setResultados] = useState<Linea[]>([{ producto_id: '', codigo: '', descripcion: '', cantidad: 0 }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    // Fix: hallazgo real (2026-11-22) — ?todas=1 es admin/compras-only; el
    // rol 'bodega' recibía 403 y el selector quedaba vacío (ver mismo fix en
    // ingresos/nuevo).
    fetch('/api/compras/bodega/bodegas').then((r) => r.json()).then((d) => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  // Spec: hallazgo real de usuario (2026-11-22) — restaura el borrador al
  // volver de crear un producto nuevo; `lineaIdx` codifica también a qué
  // tabla pertenece la línea ('insumos:N' o 'resultados:N').
  useEffect(() => {
    const volverDraft = searchParams.get('volverDraft')
    if (!volverDraft) return
    const resultado = leerDraftProducto<Draft>(volverDraft)
    limpiarDraftProducto(volverDraft)
    if (resultado) {
      const { draft, lineaIdx } = resultado
      setBodegaId(draft.bodegaId)
      const [tabla, idxStr] = String(lineaIdx).split(':')
      const idx = Number(idxStr)
      const productoCreadoId = searchParams.get('producto_creado_id')
      let { insumos: nuevosInsumos, resultados: nuevosResultados } = draft
      if (productoCreadoId) {
        const codigo = searchParams.get('producto_creado_codigo') ?? ''
        const descripcion = searchParams.get('producto_creado_descripcion') ?? ''
        const aplicar = (lineas: Linea[]) => lineas.map((l, i) => (i === idx ? { ...l, producto_id: productoCreadoId, codigo, descripcion } : l))
        if (tabla === 'insumos') nuevosInsumos = aplicar(draft.insumos)
        else if (tabla === 'resultados') nuevosResultados = aplicar(draft.resultados)
      }
      setInsumos(nuevosInsumos)
      setResultados(nuevosResultados)
    }
    router.replace(RUTA)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCrear() {
    if (!bodegaId) { toast.error('Selecciona la Bodega'); return }
    if (insumos.some((l) => !l.producto_id) || resultados.some((l) => !l.producto_id)) {
      toast.error('Toda línea requiere un producto vinculado'); return
    }
    setGuardando(true)
    try {
      const limpiar = (lineas: Linea[]) => lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }))
      const res = await fetch('/api/compras/bodega/ensamblajes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodega_id: bodegaId, insumos: limpiar(insumos), resultados: limpiar(resultados) }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al crear la orden'); return }
      toast.success(`Orden de Ensamblaje ${data.numero} creada`)
      router.push(`/compras/bodega/ensamblajes/${data.orden_id}`)
    } finally { setGuardando(false) }
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-4">
      <Card className="overflow-visible">
        <CardHeader><CardTitle>Nueva Orden de Ensamblaje (Field Build)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <ComboConAlta
              label="Bodega"
              value={bodegaId}
              onChange={setBodegaId}
              opciones={bodegas}
              onCreado={(nuevo) => setBodegas((prev) => [...prev, nuevo])}
              crearEndpoint="/api/compras/bodega/bodegas"
              construirBody={(nombre, extra) => ({ nombre, codigo: extra.codigo, referencia: extra.referencia || null })}
              camposExtra={[{ key: 'codigo', label: 'Código', requerido: true }, { key: 'referencia', label: 'Referencia (opcional)' }]}
            />
          </div>

          <TablaLineas titulo="Insumos consumidos" tabla="insumos" lineas={insumos} setLineas={setInsumos} bodegaId={bodegaId} insumos={insumos} resultados={resultados} />
          <TablaLineas titulo="Producto(s) resultante(s)" tabla="resultados" lineas={resultados} setLineas={setResultados} bodegaId={bodegaId} insumos={insumos} resultados={resultados} />

          <p className="text-xs text-gray-500">El costo del resultado se calcula al confirmar, como la suma de los costos vigentes de los insumos — no se ingresa aquí.</p>

          <Button onClick={handleCrear} disabled={guardando}>{guardando ? 'Creando...' : 'Crear Orden de Ensamblaje'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
