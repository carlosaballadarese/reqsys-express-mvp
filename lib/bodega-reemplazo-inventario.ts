import { adminClient } from '@/lib/supabase/clients'
import { parsearProductos, type FilaProductoExcel } from '@/lib/bodega-analisis-migracion'
import { crearDocumentoIngresoMasivo, cerrarDocumentoIngreso } from '@/lib/bodega-ingreso'
import { crearDocumentoEgresoMasivo, cerrarDocumentoEgreso } from '@/lib/bodega-egreso'
import ExcelJS from 'exceljs'

// Spec: HU-041 — reutiliza tal cual el parser de PRODUCTOS ya validado en
// HU-039 (lib/bodega-analisis-migracion.ts) en vez de reimplementar el
// mapeo de columnas. Desviación de alcance deliberada respecto a v1/v2: el
// "resto de campos" del importador viejo (locación/código origen/descripción
// origen/marca/observaciones) queda fuera de esta HU — sus posiciones de
// columna nunca se validaron contra un archivo real, a diferencia de
// código/descripción/área/categoría/saldo/costo (ya probados en HU-036/039).
export function parsearArchivoMaestro(workbook: ExcelJS.Workbook): FilaProductoExcel[] {
  const ws = workbook.getWorksheet('PRODUCTOS')
  if (!ws) throw new Error('El archivo no contiene la hoja "PRODUCTOS"')
  return parsearProductos(ws)
}

export type ActorReemplazo = { id: string; nombre: string; email: string; rol: string }

export type ProductoActual = {
  id: string
  codigo: string
  activo: boolean
  saldo_existencias: number
  costo_unitario: number
}

export type FilaClasificada =
  | { tipo: 'alta'; codigo: string; datos: FilaProductoExcel }
  | { tipo: 'desactivacion'; codigo: string; productoId: string }
  | { tipo: 'sin_cambio'; codigo: string; productoId: string; datos: FilaProductoExcel; reactiva: boolean }
  | {
      tipo: 'ajuste'
      codigo: string
      productoId: string
      datos: FilaProductoExcel
      saldoActual: number
      costoActual: number
      delta: number
      reactiva: boolean
    }

export type ResumenClasificacion = { altas: number; desactivaciones: number; ajustes: number; sinCambio: number }
export type ClasificacionReemplazo = { resumen: ResumenClasificacion; filas: FilaClasificada[] }

// Spec: HU-041 CA-01/CA-03/CA-04/CA-05/CA-06/CA-07 — función pura, sin
// escritura. "El archivo manda": toda línea del archivo se compara contra el
// producto real (si existe); todo producto activo que no está en el archivo
// se marca para desactivar.
export function clasificarReemplazo(
  filasArchivo: FilaProductoExcel[],
  productosActuales: ProductoActual[]
): ClasificacionReemplazo {
  const porCodigo = new Map(productosActuales.map((p) => [p.codigo, p]))
  const codigosEnArchivo = new Set(filasArchivo.map((f) => f.codigo))
  const filas: FilaClasificada[] = []

  for (const fila of filasArchivo) {
    const existente = porCodigo.get(fila.codigo)
    if (!existente) {
      filas.push({ tipo: 'alta', codigo: fila.codigo, datos: fila })
      continue
    }

    const saldoActual = Number(existente.saldo_existencias)
    const costoActual = Number(existente.costo_unitario)
    // Spec: HU-045 CA-06/RN-03 — un saldo objetivo negativo (archivo "fuera
    // del piloto", pendiente de revisión real) generaría una Salida mayor al
    // saldo disponible, bloqueando el cierre de TODO el lote de ajustes de
    // Egreso (HU-030 valida saldo suficiente de todas las líneas antes de
    // escribir cualquiera). Se limita a 0 — mismo piso que ya aplica de forma
    // natural a las altas (guard `saldoExcel > 0` en ejecutarReemplazo). El
    // valor crudo del archivo (fila.saldoExcel) nunca se muta.
    const saldoObjetivo = Math.max(0, Number(fila.saldoExcel))
    const costoObjetivo = Number(fila.costoExcel)
    const reactiva = !existente.activo

    if (saldoObjetivo !== saldoActual || costoObjetivo !== costoActual) {
      filas.push({
        tipo: 'ajuste',
        codigo: fila.codigo,
        productoId: existente.id,
        datos: fila,
        saldoActual,
        costoActual,
        delta: saldoObjetivo - saldoActual,
        reactiva,
      })
    } else {
      filas.push({ tipo: 'sin_cambio', codigo: fila.codigo, productoId: existente.id, datos: fila, reactiva })
    }
  }

  // Spec: CA-04 — todo producto activo ausente del archivo se desactiva.
  for (const p of productosActuales) {
    if (p.activo && !codigosEnArchivo.has(p.codigo)) {
      filas.push({ tipo: 'desactivacion', codigo: p.codigo, productoId: p.id })
    }
  }

  const resumen: ResumenClasificacion = {
    altas: filas.filter((f) => f.tipo === 'alta').length,
    desactivaciones: filas.filter((f) => f.tipo === 'desactivacion').length,
    ajustes: filas.filter((f) => f.tipo === 'ajuste').length,
    sinCambio: filas.filter((f) => f.tipo === 'sin_cambio').length,
  }

  return { resumen, filas }
}

export type ResultadoEjecucion = {
  altas: number
  desactivaciones: number
  reactivaciones: number
  ajustesIngreso: number
  ajustesEgreso: number
  errores: string[]
}

type LineaPendienteIngreso = { producto_id: string; cantidad: number; costo_unitario: number }
type LineaPendienteEgreso = { producto_id: string; cantidad: number; costo_objetivo: number }

// Spec: HU-041 CA-02 a CA-07, RN-06 (best-effort por producto). 1 solo
// Documento de Ingreso + 1 solo Documento de Egreso (ambos tipo
// ajuste_masivo) agrupan TODAS las líneas de ajuste de esta ejecución —
// reutiliza el motor de Kardex ya existente (HU-028/029/030), nunca lo
// reimplementa.
export async function ejecutarReemplazo(
  filas: FilaClasificada[],
  actor: ActorReemplazo,
  // Spec: HU-041 — hallazgo real de validación: documentos_egreso.bodega_id
  // es NOT NULL (HU-030 CA-01) — una recarga total puede abarcar productos
  // de múltiples bodegas sin ninguna bodega única natural para el
  // encabezado, así que se exige una "bodega de referencia" elegida por
  // quien ejecuta (aplicada a ambos documentos masivos, por consistencia).
  bodegaId: string,
  // Spec: HU-045 CA-04/RN-02 — fecha a fijar en `ultimo_conteo_fecha` SOLO
  // para productos que el archivo marca como físicamente contados
  // (`datos.inventariado === true`). Nunca hardcodeada dentro del motor: la
  // decide quien ejecuta la carga (ver `sdd-design.md`, Decisión 2) — una
  // futura recarga del archivo maestro puede no traer esa clasificación.
  fechaConteo?: string
): Promise<ResultadoEjecucion> {
  const resultado: ResultadoEjecucion = {
    altas: 0,
    desactivaciones: 0,
    reactivaciones: 0,
    ajustesIngreso: 0,
    ajustesEgreso: 0,
    errores: [],
  }

  const lineasIngresoAlta: LineaPendienteIngreso[] = []
  const lineasIngreso: LineaPendienteIngreso[] = []
  const lineasEgreso: LineaPendienteEgreso[] = []
  // Spec: HU-045 CA-04 — hallazgo real de ejecución (no detectado por los
  // tests unitarios, que mockean cerrarDocumentoIngreso/Egreso de forma
  // aislada): cerrarDocumentoIngreso()/cerrarDocumentoEgreso() YA tienen su
  // propia regla, previa a esta HU (HU-041 RN-07) — "cualquier ajuste_masivo
  // sella ultimo_conteo_fecha = HOY", sin mirar `inventariado`, y esa escritura
  // ocurre DESPUÉS del insert/update de este loop, pisando el `fechaConteo`
  // recién fijado. Se resuelve con una pasada final explícita, después del
  // cierre, que re-aplica `fechaConteo` solo a los productos con
  // `datos.inventariado === true` — tiene precedencia por ser evidencia más
  // específica que el sello genérico de "hoy", sin alterar RN-07 para el
  // resto (un ajuste sin columna de piloto sigue sellando HOY como siempre).
  const idsInventariadosConFecha: string[] = []

  for (const fila of filas) {
    if (fila.tipo === 'alta') {
      const { data, error } = await adminClient()
        .from('inventario')
        .insert({
          codigo: fila.codigo,
          descripcion: fila.datos.descripcion ?? fila.codigo,
          area: fila.datos.areaTexto,
          categoria: fila.datos.categoriaTexto,
          saldo_existencias: 0,
          costo_unitario: 0,
          activo: true,
          ...(fechaConteo && fila.datos.inventariado ? { ultimo_conteo_fecha: fechaConteo } : {}),
        })
        .select('id')
        .single()

      if (error || !data) {
        resultado.errores.push(`Alta ${fila.codigo}: ${error?.message ?? 'error desconocido'}`)
        continue
      }
      resultado.altas++
      if (fechaConteo && fila.datos.inventariado) idsInventariadosConFecha.push(data.id)

      // Spec: CA-03 — saldo inicial solo si el archivo trae saldo > 0;
      // si trae 0, no hay nada que mover (producto nuevo, saldo 0 real).
      // No se cuenta como "ajuste" (RN: altas y ajustes se reportan por
      // separado, aunque ambos puedan generar una línea de Ingreso).
      if (Number(fila.datos.saldoExcel) > 0) {
        lineasIngresoAlta.push({
          producto_id: data.id,
          cantidad: Number(fila.datos.saldoExcel),
          costo_unitario: Number(fila.datos.costoExcel),
        })
      }
      continue
    }

    if (fila.tipo === 'desactivacion') {
      const { error } = await adminClient().from('inventario').update({ activo: false }).eq('id', fila.productoId)
      if (error) resultado.errores.push(`Desactivación ${fila.codigo}: ${error.message}`)
      else resultado.desactivaciones++
      continue
    }

    // sin_cambio y ajuste comparten la actualización de campos de catálogo
    // + reactivación — ninguno de los dos requiere Kardex por sí solo.
    const { error: errCatalogo } = await adminClient()
      .from('inventario')
      .update({
        descripcion: fila.datos.descripcion ?? undefined,
        area: fila.datos.areaTexto,
        categoria: fila.datos.categoriaTexto,
        ...(fila.reactiva ? { activo: true } : {}),
        ...(fechaConteo && fila.datos.inventariado ? { ultimo_conteo_fecha: fechaConteo } : {}),
      })
      .eq('id', fila.productoId)

    if (errCatalogo) {
      resultado.errores.push(`Catálogo ${fila.codigo}: ${errCatalogo.message}`)
      continue
    }
    if (fila.reactiva) resultado.reactivaciones++
    if (fechaConteo && fila.datos.inventariado) idsInventariadosConFecha.push(fila.productoId)

    if (fila.tipo === 'ajuste') {
      if (fila.delta > 0) {
        lineasIngreso.push({
          producto_id: fila.productoId,
          cantidad: fila.delta,
          costo_unitario: Number(fila.datos.costoExcel),
        })
      } else {
        // delta<=0: cantidad=0 (solo-costo, RN-05) o delta negativo (Salida).
        lineasEgreso.push({
          producto_id: fila.productoId,
          cantidad: Math.abs(fila.delta),
          costo_objetivo: Number(fila.datos.costoExcel),
        })
      }
    }
  }

  // Spec: una alta con saldo inicial y un ajuste con delta positivo comparten
  // el mismo Documento de Ingreso (CA-06, 1 solo documento por ejecución),
  // pero se reportan por separado — `resultado.altas` ya cuenta las altas,
  // `ajustesIngreso` cuenta solo las líneas de ajuste real.
  const todasLasLineasIngreso = [...lineasIngresoAlta, ...lineasIngreso]
  if (todasLasLineasIngreso.length > 0) {
    const doc = await crearDocumentoIngresoMasivo(todasLasLineasIngreso, bodegaId, actor)
    if (!doc.ok) {
      resultado.errores.push(`Documento de Ingreso de ajuste masivo: ${doc.error}`)
    } else {
      const cierre = await cerrarDocumentoIngreso(doc.documentoId, actor)
      if (!cierre.ok) resultado.errores.push(`Cierre de ${doc.numero}: ${cierre.error}`)
      else resultado.ajustesIngreso = lineasIngreso.length
    }
  }

  if (lineasEgreso.length > 0) {
    const doc = await crearDocumentoEgresoMasivo(lineasEgreso, bodegaId, actor)
    if (!doc.ok) {
      resultado.errores.push(`Documento de Egreso de ajuste masivo: ${doc.error}`)
    } else {
      const cierre = await cerrarDocumentoEgreso(doc.documentoId, actor)
      if (!cierre.ok) resultado.errores.push(`Cierre de ${doc.numero}: ${cierre.error}`)
      else resultado.ajustesEgreso = lineasEgreso.length
    }
  }

  // Spec: HU-045 CA-04 — pasada final, DESPUÉS de los 2 cierres (ver
  // comentario junto a idsInventariadosConFecha más arriba): re-aplica
  // fechaConteo con precedencia sobre el sello genérico de HOY que
  // cerrarDocumentoIngreso/Egreso ya hacen para cualquier ajuste_masivo.
  if (idsInventariadosConFecha.length > 0) {
    const { error: errFecha } = await adminClient()
      .from('inventario')
      .update({ ultimo_conteo_fecha: fechaConteo })
      .in('id', idsInventariadosConFecha)
    if (errFecha) resultado.errores.push(`Fecha de conteo: ${errFecha.message}`)
  }

  return resultado
}
