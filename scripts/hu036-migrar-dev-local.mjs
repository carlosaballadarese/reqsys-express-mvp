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

async function main() {
  const rutaJson = process.argv[2]
  if (!rutaJson) {
    console.error('Uso: node hu036-migrar-dev-local.mjs <ruta_json_extraido>')
    process.exit(1)
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
  const saldoPorCodigo = new Map()
  const costoPromedioPorCodigo = new Map()
  const movimientosConReplay = []
  let entradasSinCosto = 0
  const entradasSinCostoPorTipo = {}

  for (const m of movimientos) {
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
      movimientosConReplay.push({ ...m, costo_unitario_real: costoEntrante, saldo_resultante: nuevoSaldo, costo_promedio_resultante: nuevoPromedio })
    } else {
      // Salida: el costo no cambia, se registra el promedio vigente.
      const nuevoSaldo = saldoAnterior + cantidad // cantidad ya viene negativa
      saldoPorCodigo.set(codigo, nuevoSaldo)
      movimientosConReplay.push({ ...m, costo_unitario_real: costoAnterior, saldo_resultante: nuevoSaldo, costo_promedio_resultante: costoAnterior })
    }
  }
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
        fecha: m.fecha ?? new Date().toISOString(),
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
