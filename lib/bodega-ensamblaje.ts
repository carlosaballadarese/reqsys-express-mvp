import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularPromedioPonderado, validarSaldoSuficiente } from '@/lib/bodega-kardex'
// Spec: HU-046 — import en una sola dirección (bodega-ingreso.ts no importa
// nada de este archivo, confirmado en sdd-design.md Decisión 1).
import { generarCorreccionCostoCeroSiAplica } from '@/lib/bodega-ingreso'

// Spec: HU-031 CA-01 — mismos roles que Egresos (HU-030): un Ensamblaje
// consume/produce inventario sin ningún vínculo a OC.
const ROLES_ENSAMBLAJE = ['bodega', 'compras', 'admin']

export type AuthEnsamblaje =
  | { ok: true; userId: string; rol: string; nombre: string; email: string }
  | { ok: false; status: 401 | 403 }

export async function verificarAutorizacionEnsamblaje(): Promise<AuthEnsamblaje> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol, nombre, email')
    .eq('id', user.id)
    .single()

  if (!perfil || !ROLES_ENSAMBLAJE.includes(perfil.rol)) return { ok: false, status: 403 }

  return { ok: true, userId: user.id, rol: perfil.rol, nombre: perfil.nombre, email: perfil.email }
}

type ActorEnsamblaje = { id: string; nombre: string; email: string; rol: string }
type Linea = { producto_id: string; cantidad: number }

type ResultadoCreacion =
  | { ok: true; ordenId: string; numero: string }
  | { ok: false; error: string }

// Spec: HU-031 CA-01 — creación con insumos y resultados en la misma orden,
// sin ninguna receta/lista de materiales predefinida.
export async function crearOrdenEnsamblaje(
  input: { bodegaId: string; insumos: Linea[]; resultados: Linea[] },
  actor: ActorEnsamblaje
): Promise<ResultadoCreacion> {
  if (!input.bodegaId) return { ok: false, error: 'bodega_id es requerido' }
  if (input.insumos.length === 0) return { ok: false, error: 'La orden debe tener al menos 1 insumo' }
  if (input.resultados.length === 0) return { ok: false, error: 'La orden debe tener al menos 1 producto resultante' }
  if (input.insumos.some((l) => !l.producto_id) || input.resultados.some((l) => !l.producto_id)) {
    return { ok: false, error: 'Toda línea requiere un producto vinculado' }
  }

  const año = new Date().getFullYear()
  const { data: numeroData } = await adminClient().rpc('siguiente_numero_ensamblaje', { p_year: año })
  const numero = `FB-${año}-${String(numeroData).padStart(4, '0')}`

  const { data: orden, error: errOrden } = await adminClient()
    .from('ordenes_ensamblaje')
    .insert({ numero, bodega_id: input.bodegaId, estado: 'generada', creado_por_id: actor.id })
    .select('id, numero')
    .single()

  if (errOrden || !orden) {
    console.error('Error al crear Orden de Ensamblaje:', errOrden)
    return { ok: false, error: 'Error al crear la orden' }
  }

  const { error: errInsumos } = await adminClient().from('ordenes_ensamblaje_insumos').insert(
    input.insumos.map((l) => ({ orden_ensamblaje_id: orden.id, producto_id: l.producto_id, cantidad: Number(l.cantidad) }))
  )
  const { error: errResultados } = await adminClient().from('ordenes_ensamblaje_resultados').insert(
    input.resultados.map((l) => ({ orden_ensamblaje_id: orden.id, producto_id: l.producto_id, cantidad: Number(l.cantidad) }))
  )
  if (errInsumos || errResultados) {
    console.error('Error al insertar líneas de la Orden de Ensamblaje:', errInsumos, errResultados)
    return { ok: false, error: 'Error al guardar las líneas' }
  }

  await registrarAuditoria({
    accion: 'crear_orden_ensamblaje',
    entidad: 'orden_ensamblaje',
    entidad_id: orden.id,
    referencia: orden.numero,
    detalle: { insumos: input.insumos.length, resultados: input.resultados.length, actor_rol: actor.rol },
  })

  return { ok: true, ordenId: orden.id, numero: orden.numero }
}

type ResultadoConfirmacion =
  | { ok: true }
  | { ok: false; error: string; insumosExcedidos?: string[] }

// Spec: HU-031 CA-02/CA-03/CA-04 — confirma la orden: valida saldo de TODOS
// los insumos primero (sin override, a diferencia de HU-030), luego escribe
// best-effort secuencial con guard idempotente (decisión del usuario, Fase
// 1 — mismo patrón que HU-016/028/030, nunca una transacción SQL real).
export async function confirmarOrdenEnsamblaje(
  ordenId: string,
  actor: ActorEnsamblaje
): Promise<ResultadoConfirmacion> {
  const { data: orden } = await adminClient()
    .from('ordenes_ensamblaje')
    .select('id, numero, estado, bodega_id')
    .eq('id', ordenId)
    .single()

  if (!orden) return { ok: false, error: 'Orden de Ensamblaje no encontrada' }
  if (orden.estado === 'confirmada') return { ok: false, error: 'La orden ya está confirmada' }

  const { data: insumos } = await adminClient()
    .from('ordenes_ensamblaje_insumos')
    .select('id, producto_id, cantidad')
    .eq('orden_ensamblaje_id', ordenId)
  const { data: resultados } = await adminClient()
    .from('ordenes_ensamblaje_resultados')
    .select('id, producto_id, cantidad')
    .eq('orden_ensamblaje_id', ordenId)

  const todosLosInsumos = insumos ?? []
  const todosLosResultados = resultados ?? []
  if (todosLosInsumos.length === 0 || todosLosResultados.length === 0) {
    return { ok: false, error: 'La orden no tiene insumos o resultados' }
  }

  const productoIds = [...new Set([...todosLosInsumos, ...todosLosResultados].map((l) => l.producto_id))]
  const { data: productos } = await adminClient()
    .from('inventario')
    .select('id, codigo, saldo_existencias, costo_unitario')
    .in('id', productoIds)
  const productoPorId = new Map((productos ?? []).map((p) => [p.id, p]))

  // Spec: CA-02 — valida saldo de TODOS los insumos antes de escribir nada.
  const insumosExcedidos = todosLosInsumos
    .filter((l) => {
      const saldoActual = Number(productoPorId.get(l.producto_id)?.saldo_existencias ?? 0)
      return !validarSaldoSuficiente(saldoActual, Number(l.cantidad))
    })
    .map((l) => productoPorId.get(l.producto_id)?.codigo ?? l.producto_id)

  if (insumosExcedidos.length > 0) {
    return { ok: false, error: 'Saldo insuficiente en uno o más insumos', insumosExcedidos }
  }

  // Spec: CA-04 — costo total de insumos, prorrateado entre las unidades resultantes.
  const costoInsumosTotal = todosLosInsumos.reduce((acc, l) => {
    const costo = Number(productoPorId.get(l.producto_id)?.costo_unitario ?? 0)
    return acc + Number(l.cantidad) * costo
  }, 0)
  const cantidadResultadosTotal = todosLosResultados.reduce((acc, l) => acc + Number(l.cantidad), 0)
  const costoPorUnidadResultado = cantidadResultadosTotal > 0 ? costoInsumosTotal / cantidadResultadosTotal : 0

  const { data: kardexYaGenerado } = await adminClient()
    .from('kardex_movimientos')
    .select('producto_id, direccion')
    .eq('orden_ensamblaje_id', ordenId)
  const insumosYaProcesados = new Set(
    (kardexYaGenerado ?? []).filter((k) => k.direccion === 'salida').map((k) => k.producto_id)
  )
  const resultadosYaProcesados = new Set(
    (kardexYaGenerado ?? []).filter((k) => k.direccion === 'entrada').map((k) => k.producto_id)
  )

  // Spec: CA-03 — egresos de insumo primero (Salida, sin recalcular promedio — RN-BOD-07).
  for (const linea of todosLosInsumos) {
    if (insumosYaProcesados.has(linea.producto_id)) continue

    const producto = productoPorId.get(linea.producto_id)
    const saldoActual = Number(producto?.saldo_existencias ?? 0)
    const costoActual = Number(producto?.costo_unitario ?? 0)
    const cantidad = Number(linea.cantidad)
    const nuevoSaldo = saldoActual - cantidad

    const { error: errKardex } = await adminClient().from('kardex_movimientos').insert({
      producto_id: linea.producto_id,
      bodega_id: orden.bodega_id,
      direccion: 'salida',
      tipo: 'field_build',
      cantidad,
      costo_unitario: costoActual,
      saldo_resultante: nuevoSaldo,
      costo_promedio_resultante: costoActual,
      orden_ensamblaje_id: ordenId,
    })
    if (errKardex) {
      console.error('Error al generar Kardex de insumo (ensamblaje):', errKardex)
      return { ok: false, error: 'Error al generar el Kardex de insumos — la orden no se confirmó, se puede reintentar' }
    }
    await adminClient().from('inventario').update({ saldo_existencias: nuevoSaldo }).eq('id', linea.producto_id)
  }

  // Spec: CA-03/CA-04 — ingresos de resultado (Entrada, SÍ recalcula promedio
  // ponderado contra el saldo/costo previo del producto resultante).
  // Spec: HU-046 CA-09 — lectura FRESCA por línea (no el mapa productoPorId
  // armado antes del loop) — necesaria para que la corrección de costo cero
  // de esta misma línea (si aplica) y cualquier línea previa de resultado del
  // mismo producto en esta Orden queden reflejadas antes de promediar.
  for (const linea of todosLosResultados) {
    if (resultadosYaProcesados.has(linea.producto_id)) continue

    const { data: productoFresco } = await adminClient()
      .from('inventario')
      .select('saldo_existencias, costo_unitario')
      .eq('id', linea.producto_id)
      .single()
    let saldoAnterior = Number(productoFresco?.saldo_existencias ?? 0)
    let costoPromedioAnterior = Number(productoFresco?.costo_unitario ?? 0)
    const cantidad = Number(linea.cantidad)

    // Spec: HU-046 CA-03 — misma corrección que en Ingreso, aplicada al
    // producto RESULTANTE del Field Build.
    const correccion = await generarCorreccionCostoCeroSiAplica({
      productoId: linea.producto_id,
      saldoActual: saldoAnterior,
      costoActual: costoPromedioAnterior,
      costoReal: costoPorUnidadResultado,
      bodegaId: orden.bodega_id,
      actor,
      referenciaDisparador: `Ensamblaje ${orden.numero}`,
    })
    if (correccion.corregido) {
      const { data: productoCorregido } = await adminClient()
        .from('inventario')
        .select('saldo_existencias, costo_unitario')
        .eq('id', linea.producto_id)
        .single()
      saldoAnterior = Number(productoCorregido?.saldo_existencias ?? 0)
      costoPromedioAnterior = Number(productoCorregido?.costo_unitario ?? 0)
    }

    const nuevoPromedio = calcularPromedioPonderado(saldoAnterior, costoPromedioAnterior, cantidad, costoPorUnidadResultado)
    const nuevoSaldo = saldoAnterior + cantidad

    const { error: errKardex } = await adminClient().from('kardex_movimientos').insert({
      producto_id: linea.producto_id,
      bodega_id: orden.bodega_id,
      direccion: 'entrada',
      tipo: 'field_build',
      cantidad,
      costo_unitario: costoPorUnidadResultado,
      saldo_resultante: nuevoSaldo,
      costo_promedio_resultante: nuevoPromedio,
      orden_ensamblaje_id: ordenId,
    })
    if (errKardex) {
      console.error('Error al generar Kardex de resultado (ensamblaje):', errKardex)
      return { ok: false, error: 'Error al generar el Kardex de resultados — la orden no se confirmó, se puede reintentar' }
    }
    await adminClient().from('inventario').update({ saldo_existencias: nuevoSaldo, costo_unitario: nuevoPromedio }).eq('id', linea.producto_id)
  }

  await adminClient()
    .from('ordenes_ensamblaje')
    .update({ estado: 'confirmada', confirmado_por_id: actor.id, confirmado_en: new Date().toISOString() })
    .eq('id', ordenId)

  await registrarAuditoria({
    accion: 'confirmar_orden_ensamblaje',
    entidad: 'orden_ensamblaje',
    entidad_id: ordenId,
    referencia: orden.numero,
    detalle: { insumos: todosLosInsumos.length, resultados: todosLosResultados.length, costo_por_unidad: costoPorUnidadResultado, actor_rol: actor.rol },
  })

  return { ok: true }
}
