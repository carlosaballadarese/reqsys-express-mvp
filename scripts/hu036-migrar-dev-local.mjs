// HU-036: carga real de catalogo base + productos + Kardex historico a
// dev:local, a partir del JSON producido por hu036-extraer-excel.py.
//
// Carga de una sola vez (no un upsert fila-a-fila repetible): el guard de
// idempotencia es "abortar si bodegas ya tiene filas", no "reintentar sin
// duplicar" como el patron best-effort de HU-016/028/030/031 (pensado para
// documentos individuales, no para una carga historica masiva de una vez).
//
// Uso: node scripts/hu036-migrar-dev-local.mjs <ruta_json_extraido>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Copia literal de lib/bodega-kardex.ts::calcularPromedioPonderado — misma
// firma y misma formula, para no depender de un import cross-runtime (.ts
// de Next vs. script .mjs suelto) en un script de una sola ejecucion.
function calcularPromedioPonderado(saldoAnterior, costoPromedioAnterior, cantidadEntrante, costoUnitarioEntrante) {
  if (saldoAnterior <= 0) return costoUnitarioEntrante
  const valorAnterior = saldoAnterior * costoPromedioAnterior
  const valorEntrante = cantidadEntrante * costoUnitarioEntrante
  const nuevoSaldo = saldoAnterior + cantidadEntrante
  return (valorAnterior + valorEntrante) / nuevoSaldo
}

// Mapeo real de Area de texto del Excel -> fila real de `areas` (SC-002).
// Nunca 'Operaciones-Niveles II' (duplicado real no relacionado, SC-002).
const AREA_TEXTO_A_NOMBRE_REAL = {
  'Mecánico': 'Operaciones - Bombeo Mecánico',
  'Eléctrico': 'Operaciones - Servicio Eléctrico',
  'Niveles': 'Operaciones - Niveles',
}

const BODEGA_CODIGO = 'BOD-PRINCIPAL'
const BODEGA_NOMBRE = 'Bodega Principal ARLIFT'

function lotes(arr, tam) {
  const out = []
  for (let i = 0; i < arr.length; i += tam) out.push(arr.slice(i, i + tam))
  return out
}

// Correccion post-cierre (ver sdd-validation.md, "Correccion post-cierre"):
// `fecha.isoformat()` del extractor Python produce una fecha "naive" a
// medianoche (ej. "2025-08-13T00:00:00"). Sin offset explicito, Postgres la
// interpreta como medianoche UTC -- en un navegador con huso horario negativo
// (ej. UTC-5, Ecuador) se renderiza como las 19:00 del dia ANTERIOR. Se fuerza
// a mediodia UTC del mismo dia calendario real: cualquier huso de UTC-12 a
// UTC+12 sigue mostrando el mismo dia.
function aMedioDiaUTC(fechaIsoNaive) {
  if (!fechaIsoNaive) return new Date().toISOString()
  const fechaSolo = fechaIsoNaive.slice(0, 10) // "YYYY-MM-DD"
  return `${fechaSolo}T12:00:00Z`
}

// Mismo hallazgo real ya documentado en HU-035 (DEF-HU-035-001): un SELECT
// sin paginar sobre una tabla con mas de 1000 filas reales se corta en
// silencio en PostgREST, sin error. Confirmado de nuevo en esta misma HU
// (ver sdd-validation.md) al reconciliar 'inventario' (1177 filas reales).
async function seleccionarTodo(tabla, columnas) {
  const PAGINA = 1000
  let desde = 0
  const todas = []
  while (true) {
    const { data, error } = await sb.from(tabla).select(columnas).range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`Error paginando ${tabla}: ${error.message}`)
    todas.push(...data)
    if (data.length < PAGINA) break
    desde += PAGINA
  }
  return todas
}

// Replay cronologico en memoria (Paso 2) -- separado de main() para que el
// modo de correccion (--solo-kardex, ver abajo) lo reutilice sin repetir
// logica. `movimientos` ya viene ordenado cronologicamente por el extractor
// Python (fecha, luego orden de fila como tiebreak) -- el indice global de
// ESE orden es lo que se persiste como `secuencia_historica` (correccion
// post-cierre, ver sdd-validation.md): desempata movimientos con la misma
// fecha sin depender de `created_at` (que puede repetirse identico dentro de
// un mismo batch/transaccion de insercion).
function replayCronologico(movimientos) {
  const saldoPorCodigo = new Map()
  const costoPromedioPorCodigo = new Map()
  const movimientosConReplay = []
  let entradasSinCosto = 0
  const entradasSinCostoPorTipo = {}

  movimientos.forEach((m, index) => {
    const codigo = m.codigo
    const saldoAnterior = saldoPorCodigo.get(codigo) ?? 0
    const costoAnterior = costoPromedioPorCodigo.get(codigo) ?? 0
    const cantidad = Number(m.cantidad) || 0

    if (m.mov === 'entrada') {
      let costoEntrante = m.costo_unit_sheet
      if (costoEntrante === null || costoEntrante === undefined) {
        // Hallazgo real de Fase 3 (no documentado en v2, ver sdd-validation.md):
        // 326 Entradas reales no tienen Costo Unitario capturado en el Excel
        // (mayoria Reconteo). Se usa 0 — mismo default que el propio sistema
        // en vivo usaria hoy si se dejara el campo en blanco al crear el
        // documento (documentos_ingreso_items.costo_unitario DEFAULT 0).
        costoEntrante = 0
        entradasSinCosto++
        entradasSinCostoPorTipo[m.tipo_excel] = (entradasSinCostoPorTipo[m.tipo_excel] ?? 0) + 1
      }
      const nuevoPromedio = calcularPromedioPonderado(saldoAnterior, costoAnterior, cantidad, costoEntrante)
      const nuevoSaldo = saldoAnterior + cantidad
      saldoPorCodigo.set(codigo, nuevoSaldo)
      costoPromedioPorCodigo.set(codigo, nuevoPromedio)
      movimientosConReplay.push({ ...m, secuencia_historica: index, costo_unitario_real: costoEntrante, saldo_resultante: nuevoSaldo, costo_promedio_resultante: nuevoPromedio })
    } else {
      // Salida: el costo no cambia, se registra el promedio vigente.
      const nuevoSaldo = saldoAnterior + cantidad // cantidad ya viene negativa
      saldoPorCodigo.set(codigo, nuevoSaldo)
      movimientosConReplay.push({ ...m, secuencia_historica: index, costo_unitario_real: costoAnterior, saldo_resultante: nuevoSaldo, costo_promedio_resultante: costoAnterior })
    }
  })

  return { saldoPorCodigo, costoPromedioPorCodigo, movimientosConReplay, entradasSinCosto, entradasSinCostoPorTipo }
}

// Correccion post-cierre: recarga SOLO kardex_movimientos (fecha a mediodia
// UTC + secuencia_historica), sin tocar catalogo/inventario ya reconciliados
// correctamente. Uso: node hu036-migrar-dev-local.mjs <json> --solo-kardex
async function corregirSoloKardex(rutaJson) {
  const data = JSON.parse(readFileSync(rutaJson, 'utf-8'))
  const { movimientos } = data
  console.log(`[--solo-kardex] Movimientos en JSON: ${movimientos.length}`)

  const inventarioExistente = await seleccionarTodo('inventario', 'id, codigo')
  const idPorCodigo = new Map(inventarioExistente.map((r) => [r.codigo, r.id]))
  console.log(`[--solo-kardex] Productos reales en 'inventario': ${idPorCodigo.size}`)

  // Confirma que el filtro de borrado captura EXACTAMENTE las filas
  // historicas de HU-036 (sin documento real detras) antes de borrar nada.
  const { count: totalKardexAntes } = await sb.from('kardex_movimientos').select('*', { count: 'exact', head: true })
  const { count: historicasAntes } = await sb.from('kardex_movimientos').select('*', { count: 'exact', head: true })
    .is('documento_ingreso_id', null).is('documento_egreso_id', null).is('orden_ensamblaje_id', null)
  console.log(`[--solo-kardex] kardex_movimientos total: ${totalKardexAntes}, sin documento (candidatas a recarga historica): ${historicasAntes}`)
  if (historicasAntes !== totalKardexAntes) {
    throw new Error(`ABORTADO: hay ${totalKardexAntes - historicasAntes} fila(s) con documento real asociado (no son historicas de HU-036) — revisar antes de borrar, el filtro no debe tocarlas.`)
  }

  const { error: errDelete } = await sb.from('kardex_movimientos').delete()
    .is('documento_ingreso_id', null).is('documento_egreso_id', null).is('orden_ensamblaje_id', null)
  if (errDelete) throw new Error(`Error borrando kardex historico previo: ${errDelete.message}`)
  console.log(`[--solo-kardex] ${historicasAntes} fila(s) historica(s) previa(s) borrada(s).`)

  const { movimientosConReplay, entradasSinCosto, entradasSinCostoPorTipo } = replayCronologico(movimientos)
  console.log(`[--solo-kardex] Entradas sin costo en el Excel (default=0): ${entradasSinCosto}`, entradasSinCostoPorTipo)

  const filasKardex = movimientosConReplay
    .map((m) => {
      const productoId = idPorCodigo.get(m.codigo)
      if (!productoId) return null
      return {
        producto_id: productoId,
        bodega_id: null, // se resuelve abajo tras leer la bodega real ya sembrada
        direccion: m.mov,
        tipo: m.tipo,
        cantidad: Math.abs(Number(m.cantidad) || 0),
        costo_unitario: m.costo_unitario_real,
        saldo_resultante: m.saldo_resultante,
        costo_promedio_resultante: m.costo_promedio_resultante,
        fecha: aMedioDiaUTC(m.fecha),
        secuencia_historica: m.secuencia_historica,
      }
    })
    .filter(Boolean)

  const { data: bodegaReal, error: errBodegaReal } = await sb.from('bodegas').select('id').eq('codigo', BODEGA_CODIGO).single()
  if (errBodegaReal || !bodegaReal) throw new Error(`No se encontro la bodega real ya sembrada ('${BODEGA_CODIGO}'): ${errBodegaReal?.message}`)
  for (const fila of filasKardex) fila.bodega_id = bodegaReal.id

  const sinProducto = movimientosConReplay.length - filasKardex.length
  if (sinProducto > 0) console.log(`[--solo-kardex] AVISO: ${sinProducto} movimientos sin producto_id resoluble — omitidos.`)

  let insertados = 0
  for (const lote of lotes(filasKardex, 500)) {
    const { error } = await sb.from('kardex_movimientos').insert(lote)
    if (error) throw new Error(`Error insertando lote corregido de kardex: ${error.message}`)
    insertados += lote.length
  }
  console.log(`[--solo-kardex] kardex_movimientos re-insertados con fecha corregida + secuencia_historica: ${insertados}`)

  // Empates de fecha reales dentro del mismo producto (dimensiona el bug).
  const clavesPorProductoFecha = new Map()
  for (const fila of filasKardex) {
    const clave = `${fila.producto_id}|${fila.fecha}`
    clavesPorProductoFecha.set(clave, (clavesPorProductoFecha.get(clave) ?? 0) + 1)
  }
  const gruposConEmpate = [...clavesPorProductoFecha.values()].filter((n) => n > 1)
  const filasEnEmpate = gruposConEmpate.reduce((a, n) => a + n, 0)
  console.log(`[--solo-kardex] Grupos producto+fecha con 2+ movimientos (empate real): ${gruposConEmpate.length} grupos, ${filasEnEmpate} filas totales involucradas.`)
}

async function main() {
  const rutaJson = process.argv[2]
  if (!rutaJson) {
    console.error('Uso: node hu036-migrar-dev-local.mjs <ruta_json_extraido> [--solo-kardex]')
    process.exit(1)
  }

  if (process.argv[3] === '--solo-kardex') {
    await corregirSoloKardex(rutaJson)
    return
  }

  const data = JSON.parse(readFileSync(rutaJson, 'utf-8'))
  const { productos, movimientos, resumen } = data

  console.log(`Productos en JSON: ${productos.length}`)
  console.log(`Movimientos en JSON: ${movimientos.length}`)

  // --- Guard de idempotencia ---
  const { count: bodegasExistentes } = await sb.from('bodegas').select('*', { count: 'exact', head: true })
  if (bodegasExistentes > 0) {
    console.error(`ABORTADO: ya hay ${bodegasExistentes} fila(s) en 'bodegas' — la carga ya se ejecuto antes. Limpia manualmente antes de reintentar.`)
    process.exit(1)
  }

  // --- Paso 1: catalogo base ---
  console.log('\n--- Paso 1: catalogo base ---')

  const { data: bodegaIns, error: errBodega } = await sb
    .from('bodegas')
    .insert({ codigo: BODEGA_CODIGO, nombre: BODEGA_NOMBRE, referencia: 'Sitio unico real — migracion HU-036' })
    .select('id')
    .single()
  if (errBodega) throw new Error(`Error creando bodega: ${errBodega.message}`)
  const bodegaId = bodegaIns.id
  console.log(`Bodega creada: ${BODEGA_NOMBRE} (${bodegaId})`)

  // Categorias reales (excluye None/header-residual, ya filtrado por el
  // script de extraccion).
  const categoriasReales = resumen.categorias_reales
  const categoriaRows = categoriasReales.map((nombre) => ({ nombre }))
  const { data: categoriasIns, error: errCat } = await sb.from('categorias').insert(categoriaRows).select('id, nombre')
  if (errCat) throw new Error(`Error creando categorias: ${errCat.message}`)
  const categoriaIdPorNombre = new Map(categoriasIns.map((c) => [c.nombre, c.id]))
  console.log(`Categorias creadas: ${categoriasIns.length}`)

  // Areas reales -> habilitar para Bodega + resolver sus IDs reales.
  const areaIdPorTextoExcel = new Map()
  for (const [textoExcel, nombreReal] of Object.entries(AREA_TEXTO_A_NOMBRE_REAL)) {
    const { data: areaRow, error: errArea } = await sb
      .from('areas')
      .select('id, nombre')
      .eq('nombre', nombreReal)
      .single()
    if (errArea || !areaRow) throw new Error(`No se encontro el area real '${nombreReal}': ${errArea?.message}`)
    await sb.from('areas').update({ habilitada_para_bodega: true }).eq('id', areaRow.id)
    areaIdPorTextoExcel.set(textoExcel, areaRow.id)
  }
  console.log(`Areas habilitadas para Bodega: ${[...areaIdPorTextoExcel.keys()].join(', ')}`)

  // Cruces area<->categoria (N:M real, 32→31 reales + 3 con 2 areas = 34 filas… ver resumen real).
  const cruces = []
  for (const [categoriaTexto, areasTexto] of Object.entries(resumen.cruces_area_categoria)) {
    const categoriaId = categoriaIdPorNombre.get(categoriaTexto)
    if (!categoriaId) continue
    for (const areaTexto of areasTexto) {
      const areaId = areaIdPorTextoExcel.get(areaTexto)
      if (!areaId) continue
      cruces.push({ area_id: areaId, categoria_id: categoriaId })
    }
  }
  const { error: errCruces } = await sb.from('area_categoria_bodega').insert(cruces)
  if (errCruces) throw new Error(`Error creando cruces area-categoria: ${errCruces.message}`)
  console.log(`Cruces area<->categoria creados: ${cruces.length}`)

  // --- Paso 2: replay cronologico en memoria, por codigo ---
  console.log('\n--- Paso 2: replay cronologico ---')
  const { saldoPorCodigo, costoPromedioPorCodigo, movimientosConReplay, entradasSinCosto, entradasSinCostoPorTipo } = replayCronologico(movimientos)
  console.log(`Entradas sin costo en el Excel (default=0, ver sdd-validation.md): ${entradasSinCosto}`)
  console.log('Por tipo:', entradasSinCostoPorTipo)

  // --- Paso 3: reconciliar inventario ---
  console.log('\n--- Paso 3: reconciliar inventario ---')
  const inventarioExistente = await seleccionarTodo('inventario', 'id, codigo')
  const idPorCodigoExistente = new Map(inventarioExistente.map((r) => [r.codigo, r.id]))
  console.log(`Filas reales leídas de 'inventario' (paginado): ${inventarioExistente.length}`)

  let actualizados = 0
  let insertados = 0
  const idPorCodigo = new Map(idPorCodigoExistente)

  for (const p of productos) {
    const categoriaId = p.categoria_texto ? categoriaIdPorNombre.get(p.categoria_texto) ?? null : null
    const existenteId = idPorCodigoExistente.get(p.codigo)

    if (existenteId) {
      const { error } = await sb
        .from('inventario')
        .update({ bodega_id: bodegaId, categoria_id: categoriaId })
        .eq('id', existenteId)
      if (error) throw new Error(`Error actualizando ${p.codigo}: ${error.message}`)
      actualizados++
    } else {
      const saldoFinal = saldoPorCodigo.get(p.codigo) ?? p.saldo_excel ?? 0
      const costoFinal = costoPromedioPorCodigo.get(p.codigo) ?? p.costo_excel ?? 0
      const { data: nuevo, error } = await sb
        .from('inventario')
        .insert({
          codigo: p.codigo,
          descripcion: p.descripcion ?? p.codigo,
          area: p.area_texto ?? null,
          categoria: p.categoria_texto ?? null,
          bodega_id: bodegaId,
          categoria_id: categoriaId,
          saldo_existencias: saldoFinal,
          costo_unitario: costoFinal,
          locacion: p.locacion ?? null,
          codigo_origen: p.codigo_origen ?? null,
          descripcion_origen: p.descripcion_origen ?? null,
          marca: p.marca ?? null,
          observaciones: p.observaciones ?? null,
        })
        .select('id')
        .single()
      if (error) throw new Error(`Error insertando ${p.codigo}: ${error.message}`)
      idPorCodigo.set(p.codigo, nuevo.id)
      insertados++
    }
  }
  console.log(`Inventario — actualizados: ${actualizados}, insertados: ${insertados}`)

  // --- Paso 4: carga de kardex_movimientos en lotes ---
  console.log('\n--- Paso 4: kardex_movimientos ---')
  const filasKardex = movimientosConReplay
    .map((m) => {
      const productoId = idPorCodigo.get(m.codigo)
      if (!productoId) return null
      return {
        producto_id: productoId,
        bodega_id: bodegaId,
        direccion: m.mov,
        tipo: m.tipo,
        cantidad: Math.abs(Number(m.cantidad) || 0),
        costo_unitario: m.costo_unitario_real,
        saldo_resultante: m.saldo_resultante,
        costo_promedio_resultante: m.costo_promedio_resultante,
        fecha: aMedioDiaUTC(m.fecha),
        secuencia_historica: m.secuencia_historica,
      }
    })
    .filter(Boolean)

  const sinProducto = movimientosConReplay.length - filasKardex.length
  if (sinProducto > 0) console.log(`AVISO: ${sinProducto} movimientos sin producto_id resoluble (codigo no encontrado) — omitidos.`)

  let insertadosKardex = 0
  for (const lote of lotes(filasKardex, 500)) {
    const { error } = await sb.from('kardex_movimientos').insert(lote)
    if (error) throw new Error(`Error insertando lote de kardex: ${error.message}`)
    insertadosKardex += lote.length
  }
  console.log(`kardex_movimientos insertados: ${insertadosKardex}`)

  // --- Paso 5: reporte de integridad ---
  console.log('\n--- Paso 5: reporte de integridad ---')
  const { count: totalInventario } = await sb.from('inventario').select('*', { count: 'exact', head: true })
  const { count: totalKardex } = await sb.from('kardex_movimientos').select('*', { count: 'exact', head: true })
  console.log(`Total inventario tras migracion: ${totalInventario}`)
  console.log(`Total kardex_movimientos tras migracion: ${totalKardex}`)

  const divergentes = []
  for (const p of productos) {
    const saldoReplay = saldoPorCodigo.get(p.codigo)
    if (saldoReplay === undefined) continue // sin movimientos
    const saldoReal = p.saldo_excel
    if (Math.abs(saldoReplay - saldoReal) > 0.01) {
      divergentes.push({ codigo: p.codigo, saldoReplay, saldoReal })
    }
  }
  console.log(`Productos con saldo final (replay) distinto del saldo real del Excel: ${divergentes.length}`)
  console.log(JSON.stringify(divergentes, null, 2))

  console.log('\nMigracion completada.')
}

main().catch((err) => {
  console.error('ERROR FATAL:', err)
  process.exit(1)
})
