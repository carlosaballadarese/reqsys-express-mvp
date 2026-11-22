'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Resumen = { altas: number; desactivaciones: number; ajustes: number; sinCambio: number }
type Clasificacion = { resumen: Resumen; filas: unknown[] }
type Resultado = {
  altas: number
  desactivaciones: number
  reactivaciones: number
  ajustesIngreso: number
  ajustesEgreso: number
  errores: string[]
}
type Bodega = { id: string; nombre: string }

// Spec: HU-041 — wizard de 3 pasos: subir+analizar (sin escribir nada) →
// revisar resumen → confirmar explícitamente (CA-01/CA-02). "El archivo
// manda": altas, desactivaciones y ajustes de saldo/costo (vía Kardex,
// nunca escritura directa) se derivan 100% del archivo subido.
export default function ReemplazoInventarioPage() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [clasificacion, setClasificacion] = useState<Clasificacion | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [bodegaId, setBodegaId] = useState('')

  useEffect(() => {
    fetch('/api/compras/bodega/bodegas?todas=1').then(r => r.json()).then(d => setBodegas(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  async function analizar() {
    if (!archivo) return
    setCargando(true); setError(''); setClasificacion(null); setResultado(null)
    try {
      const formData = new FormData()
      formData.append('file', archivo)
      const res = await fetch('/api/compras/bodega/reemplazo-inventario/analizar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al analizar el archivo'); return }
      setClasificacion(data)
    } finally {
      setCargando(false)
    }
  }

  async function ejecutar() {
    if (!clasificacion || !bodegaId) return
    setCargando(true); setError('')
    try {
      const res = await fetch('/api/compras/bodega/reemplazo-inventario/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: clasificacion.filas, bodegaId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al ejecutar el reemplazo'); return }
      setResultado(data)
    } finally {
      setCargando(false)
    }
  }

  async function descargarDetalle() {
    if (!clasificacion) return
    const res = await fetch('/api/compras/bodega/reemplazo-inventario/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filas: clasificacion.filas, resultado }),
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Reemplazo_Total_Inventario.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function reiniciar() {
    setArchivo(null); setClasificacion(null); setResultado(null); setError('')
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reemplazo Total de Inventario desde Archivo Maestro</h1>
        <p className="text-sm text-slate-500 mt-1">
          El archivo manda: altas nuevas, desactivación de lo que ya no aparece, y ajuste de
          saldo/costo al valor exacto del archivo — siempre vía un movimiento real de Kardex,
          nunca pisando el dato directo.{' '}
          <Link href="/compras/bodega/analisis-migracion" className="text-blue-600 hover:underline">
            ¿Querés validar el archivo primero, sin escribir nada?
          </Link>
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      {!clasificacion && (
        <Card>
          <CardHeader><CardTitle className="text-base">1. Subir archivo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button onClick={analizar} disabled={!archivo || cargando} className="btn-primary">
              {cargando ? 'Analizando...' : 'Analizar (no escribe nada todavía)'}
            </Button>
          </CardContent>
        </Card>
      )}

      {clasificacion && !resultado && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Resumen de impacto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded border border-green-200 bg-green-50 py-3">
                <div className="text-2xl font-bold text-green-700">{clasificacion.resumen.altas}</div>
                <div className="text-xs text-green-700">Altas nuevas</div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 py-3">
                <div className="text-2xl font-bold text-gray-700">{clasificacion.resumen.desactivaciones}</div>
                <div className="text-xs text-gray-700">Se desactivarán</div>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 py-3">
                <div className="text-2xl font-bold text-amber-700">{clasificacion.resumen.ajustes}</div>
                <div className="text-xs text-amber-700">Ajuste saldo/costo</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 py-3">
                <div className="text-2xl font-bold text-slate-600">{clasificacion.resumen.sinCambio}</div>
                <div className="text-xs text-slate-600">Sin cambio</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              El detalle línea por línea completo queda disponible al final en el Excel de auditoría.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Bodega de referencia para los ajustes (requerida)
              </label>
              <select
                value={bodegaId}
                onChange={(e) => setBodegaId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
              >
                <option value="">— selecciona una bodega —</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <Button onClick={ejecutar} disabled={cargando || !bodegaId} className="btn-primary">
                {cargando ? 'Ejecutando...' : 'Ejecutar reemplazo'}
              </Button>
              <Button onClick={reiniciar} variant="outline" disabled={cargando}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card className="border-green-300">
          <CardHeader><CardTitle className="text-base">3. Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm text-slate-700 space-y-1">
              <li>Altas creadas: <strong>{resultado.altas}</strong></li>
              <li>Desactivadas: <strong>{resultado.desactivaciones}</strong></li>
              <li>Reactivadas: <strong>{resultado.reactivaciones}</strong></li>
              <li>Ajustes vía Ingreso (Kardex): <strong>{resultado.ajustesIngreso}</strong></li>
              <li>Ajustes vía Egreso (Kardex): <strong>{resultado.ajustesEgreso}</strong></li>
            </ul>
            {resultado.errores.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <p className="text-amber-700 text-xs font-medium">Errores puntuales (no detuvieron el resto, RN-06):</p>
                <ul className="text-amber-700 text-xs list-disc pl-4">
                  {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={descargarDetalle} variant="outline">⬇ Descargar detalle (Excel)</Button>
              <Button onClick={reiniciar} className="btn-primary">Nuevo reemplazo</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
