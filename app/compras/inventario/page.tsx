'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Item = {
  id: string
  codigo: string
  descripcion: string
  area: string | null
  categoria: string | null
  saldo_existencias: number
  costo_unitario: number
  locacion: string | null
  marca: string | null
}

type ImportResult = {
  total: number
  insertados: number
  actualizados: number
  errores: string[]
}

export default function InventarioPage() {
  const [items, setItems]         = useState<Item[]>([])
  const [cargando, setCargando]   = useState(true)
  const [q, setQ]                 = useState('')
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  const [dialogOpen, setDialogOpen]       = useState(false)
  const [importando, setImportando]       = useState(false)
  const [importResult, setImportResult]   = useState<ImportResult | null>(null)
  const [importError, setImportError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (q.trim())    params.set('q', q.trim())
    if (categoria)   params.set('categoria', categoria)

    fetch(`/api/compras/inventario?${params}`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : []
        setItems(lista)
        // Extraer categorías únicas para el filtro
        const cats = [...new Set(lista.map((i: Item) => i.categoria).filter(Boolean))] as string[]
        if (cats.length > 0) setCategorias(prev => [...new Set([...prev, ...cats])])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [q, categoria])

  useEffect(() => { cargar() }, [cargar])

  async function handleImportar() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setImportError('Seleccioná un archivo .xlsx'); return }
    setImportando(true); setImportError(''); setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/compras/inventario/importar', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        setImportResult(data)
        cargar()
      } else {
        setImportError(data.error ?? 'Error al importar')
      }
    } catch { setImportError('Error de conexión') }
    finally { setImportando(false) }
  }

  function abrirDialog() {
    setDialogOpen(true); setImportResult(null); setImportError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">Inventario</h1>
          <div className="flex gap-2">
            <a href="/api/exportar/inventario" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Excel</Button>
            </a>
            <Button onClick={abrirDialog} variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">↑ Importar Excel</Button>
            <Link href="/compras/inventario/nuevo">
              <Button className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">+ Nuevo Ítem</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Buscar código, descripción o marca..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()}
                className="h-9 text-sm"
              />
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div /> {/* spacer */}
              <Button onClick={cargar} className="h-9 btn-primary">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${items.length} ítems`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-12 text-slate-400">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay ítems con los filtros aplicados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4">Código</th>
                      <th className="text-left py-3 pr-4">Descripción</th>
                      <th className="text-left py-3 pr-4">Categoría</th>
                      <th className="text-left py-3 pr-4">Área</th>
                      <th className="text-left py-3 pr-4">Marca</th>
                      <th className="text-right py-3 pr-4">Stock</th>
                      <th className="text-right py-3 pr-4">Costo Unit.</th>
                      <th className="text-left py-3 pr-4">Locación</th>
                      <th className="text-left py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-slate-600">{item.codigo}</td>
                        <td className="py-3 pr-4 font-medium">{item.descripcion}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.categoria ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.area ?? '—'}</td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.marca ?? '—'}</td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`font-medium ${Number(item.saldo_existencias) > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                            {Number(item.saldo_existencias).toFixed(0)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-600">
                          {Number(item.costo_unitario) > 0 ? `$${Number(item.costo_unitario).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">{item.locacion ?? '—'}</td>
                        <td className="py-3">
                          <Link href={`/compras/inventario/${item.id}`} className="text-xs text-blue-600 hover:underline">
                            Editar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog importación Excel */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Importar inventario desde Excel</h2>
            <p className="text-xs text-slate-500">
              Seleccioná el archivo <span className="font-mono font-medium">Control Inventario - ARLIFT.xlsx</span>.
              La hoja <strong>PRODUCTOS</strong> debe tener encabezados en la fila 8.
              Los registros existentes se actualizarán por código; los nuevos se insertarán.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />

            {importError && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{importError}</p>
            )}

            {importResult && (
              <div className="bg-green-50 border border-green-200 rounded px-3 py-3 space-y-1">
                <p className="text-green-700 text-sm font-medium">✓ Importación completada</p>
                <p className="text-green-600 text-xs">Total procesados: <strong>{importResult.total}</strong></p>
                <p className="text-green-600 text-xs">Actualizados: <strong>{importResult.actualizados}</strong> · Insertados: <strong>{importResult.insertados}</strong></p>
                {importResult.errores.length > 0 && (
                  <p className="text-amber-600 text-xs">Errores en lotes: {importResult.errores.join(', ')}</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              {!importResult ? (
                <Button onClick={handleImportar} disabled={importando} className="flex-1 btn-primary">
                  {importando ? 'Procesando...' : 'Procesar archivo'}
                </Button>
              ) : (
                <Button onClick={() => setDialogOpen(false)} className="flex-1 btn-primary">Cerrar</Button>
              )}
              {!importResult && (
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={importando}>Cancelar</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
