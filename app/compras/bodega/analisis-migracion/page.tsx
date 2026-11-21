'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Informe = {
  conteos: {
    totalProductos: number
    totalMovimientos: number
    porDireccion: { entrada: number; salida: number }
    porTipo: Record<string, number>
    tiposSinMapear: string[]
  }
  calidadDatos: {
    entradasSinCosto: number
    entradasSinCostoPorTipo: Record<string, number>
    productosSaldoNegativo: string[]
    categoriasMultiArea: Record<string, string[]>
  }
  divergenciasInternas: { codigo: string; saldoReplay: number; saldoExcel: number }[]
  divergenciasInventarioReal: { codigo: string; saldoReplay: number; saldoReal: number; costoReplay: number; costoReal: number }[]
  recomendacion: { apto: boolean; resumen: string }
}

// Spec: HU-039 — herramienta de análisis del archivo de migración de
// inventario, 100% de solo lectura (RN-02). Nunca exporta a Excel (CA-09) —
// el informe se muestra en pantalla.
export default function AnalisisMigracionPage() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function analizar() {
    if (!archivo) return
    setCargando(true)
    setError('')
    setInforme(null)
    try {
      const formData = new FormData()
      formData.append('file', archivo)
      const res = await fetch('/api/compras/bodega/analisis-migracion', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al analizar el archivo'); return }
      setInforme(data)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Análisis de Archivo de Migración</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sube un archivo Excel candidato (hojas PRODUCTOS/KARDEX) para validarlo antes de usarlo
          en la migración real de inventario. Esta herramienta nunca escribe nada en la base de datos.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <input type="file" accept=".xlsx" onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm" />
          <Button size="sm" disabled={!archivo || cargando} onClick={analizar}>
            {cargando ? 'Analizando…' : 'Analizar'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200"><CardContent className="pt-4 text-sm text-red-700">{error}</CardContent></Card>
      )}

      {informe && (
        <>
          <Card className={informe.recomendacion.apto ? 'border-green-300' : 'border-amber-300'}>
            <CardHeader><CardTitle className="text-base">Recomendación</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-sm font-medium ${informe.recomendacion.apto ? 'text-green-700' : 'text-amber-700'}`}>
                {informe.recomendacion.resumen}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Conteos</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>Total de productos: <strong>{informe.conteos.totalProductos}</strong></p>
              <p>Total de movimientos: <strong>{informe.conteos.totalMovimientos}</strong></p>
              <p>Entrada: <strong>{informe.conteos.porDireccion.entrada}</strong> · Salida: <strong>{informe.conteos.porDireccion.salida}</strong></p>
              <div>
                <p className="font-medium">Por tipo:</p>
                <ul className="list-disc list-inside text-slate-600">
                  {Object.entries(informe.conteos.porTipo).map(([tipo, n]) => <li key={tipo}>{tipo}: {n}</li>)}
                </ul>
              </div>
              {informe.conteos.tiposSinMapear.length > 0 && (
                <p className="text-amber-700">Tipos sin mapear: {informe.conteos.tiposSinMapear.join(', ')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Calidad de datos</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>Entradas sin Costo Unitario capturado: <strong>{informe.calidadDatos.entradasSinCosto}</strong></p>
              <ul className="list-disc list-inside text-slate-600">
                {Object.entries(informe.calidadDatos.entradasSinCostoPorTipo).map(([tipo, n]) => <li key={tipo}>{tipo}: {n}</li>)}
              </ul>
              <p>Productos con saldo negativo en algún punto del historial ({informe.calidadDatos.productosSaldoNegativo.length}): <span className="text-slate-600">{informe.calidadDatos.productosSaldoNegativo.join(', ') || '—'}</span></p>
              {Object.keys(informe.calidadDatos.categoriasMultiArea).length > 0 && (
                <div>
                  <p className="font-medium">Categorías en 2+ áreas (informativo):</p>
                  <ul className="list-disc list-inside text-slate-600">
                    {Object.entries(informe.calidadDatos.categoriasMultiArea).map(([cat, areas]) => <li key={cat}>{cat}: {areas.join(', ')}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Divergencias internas ({informe.divergenciasInternas.length})</CardTitle></CardHeader>
            <CardContent>
              {informe.divergenciasInternas.length === 0 ? <p className="text-sm text-slate-400">Ninguna.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th>Código</th><th>Saldo replay</th><th>Saldo Excel</th></tr></thead>
                  <tbody>
                    {informe.divergenciasInternas.map(d => (
                      <tr key={d.codigo} className="border-t"><td>{d.codigo}</td><td>{d.saldoReplay}</td><td>{d.saldoExcel}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Divergencias contra inventario real ({informe.divergenciasInventarioReal.length})</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-slate-400 mb-2">Informativo — no afecta la recomendación de aptitud del archivo.</p>
              {informe.divergenciasInventarioReal.length === 0 ? <p className="text-sm text-slate-400">Ninguna.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th>Código</th><th>Saldo replay</th><th>Saldo real</th><th>Costo replay</th><th>Costo real</th></tr></thead>
                  <tbody>
                    {informe.divergenciasInventarioReal.map(d => (
                      <tr key={d.codigo} className="border-t"><td>{d.codigo}</td><td>{d.saldoReplay}</td><td>{d.saldoReal}</td><td>{d.costoReplay.toFixed(2)}</td><td>{d.costoReal.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
