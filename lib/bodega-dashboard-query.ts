import {
  type FiltrosReporteBodega,
  obtenerExistenciasValorizadas,
} from '@/lib/bodega-reportes-query'
import { calcularAlertaStock, calcularAlertaConteo } from '@/lib/bodega-alertas'

// Spec: HU-038 RN-04 — capa de composición pura, NO toca lib/bodega-alertas.ts
// (HU-033/HU-034, ya shippeado) — solo extiende de forma aditiva
// lib/bodega-reportes-query.ts (HU-035) para exponer los 3 campos que faltaban.

export type ProductoConAlerta = {
  id: string
  codigo: string
  descripcion: string
  bodega_nombre: string | null
  bajo_minimo: boolean
  sobre_maximo: boolean
  conteo_vencido: boolean
}

export type ResumenDashboardBodega = {
  kpis: {
    total_productos: number
    valor_total_inventario: number
    productos_con_alerta_stock: number
    productos_con_alerta_conteo: number
  }
  porBodega: { bodega_nombre: string; valor_total: number }[]
  porCategoria: { categoria_nombre: string; valor_total: number }[]
  productosConAlerta: ProductoConAlerta[]
}

// Spec: HU-038 CA-01 a CA-04 — una sola fuente de datos (obtenerExistenciasValorizadas,
// ya filtrada por bodega_id/categoria_id/area_id) alcanza para las 4 piezas del
// Dashboard, sin queries adicionales — a diferencia del precedente de HU-025
// (oca-dashboard-query.ts), que compone 4 funciones distintas.
export async function obtenerResumenDashboardBodega(
  filtros: FiltrosReporteBodega
): Promise<ResumenDashboardBodega> {
  const filas = await obtenerExistenciasValorizadas(filtros)

  let valorTotalInventario = 0
  let productosConAlertaStock = 0
  let productosConAlertaConteo = 0
  const porBodegaMap = new Map<string, number>()
  const porCategoriaMap = new Map<string, number>()
  const productosConAlerta: ProductoConAlerta[] = []

  for (const p of filas) {
    valorTotalInventario += p.valor_total

    const bodegaNombre = p.bodega_nombre ?? '—'
    porBodegaMap.set(bodegaNombre, (porBodegaMap.get(bodegaNombre) ?? 0) + p.valor_total)
    const categoriaNombre = p.categoria_nombre ?? '—'
    porCategoriaMap.set(categoriaNombre, (porCategoriaMap.get(categoriaNombre) ?? 0) + p.valor_total)

    const { bajoMinimo, sobreMaximo } = calcularAlertaStock(p.saldo_existencias, p.stock_minimo, p.stock_maximo)
    // Spec: HU-038 RN-05 — "alerta de conteo" cuenta solo el semáforo 'rojo'
    // (>1 año sin conteo real); se excluye 'sin_conteo' (productos recién
    // creados, ej. vía AltaProductoRapida de HU-037, no es una alerta real
    // todavía) y 'amarillo' (advertencia temprana, no urgente).
    const conteoVencido = calcularAlertaConteo(p.ultimo_conteo_fecha) === 'rojo'

    if (bajoMinimo || sobreMaximo) productosConAlertaStock++
    if (conteoVencido) productosConAlertaConteo++

    if (bajoMinimo || sobreMaximo || conteoVencido) {
      productosConAlerta.push({
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        bodega_nombre: p.bodega_nombre,
        bajo_minimo: bajoMinimo,
        sobre_maximo: sobreMaximo,
        conteo_vencido: conteoVencido,
      })
    }
  }

  return {
    kpis: {
      total_productos: filas.length,
      valor_total_inventario: valorTotalInventario,
      productos_con_alerta_stock: productosConAlertaStock,
      productos_con_alerta_conteo: productosConAlertaConteo,
    },
    porBodega: [...porBodegaMap.entries()].map(([bodega_nombre, valor_total]) => ({ bodega_nombre, valor_total })),
    porCategoria: [...porCategoriaMap.entries()].map(([categoria_nombre, valor_total]) => ({ categoria_nombre, valor_total })),
    productosConAlerta,
  }
}
