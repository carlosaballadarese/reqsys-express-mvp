'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

export type InvItem = {
  id: string
  codigo: string
  descripcion: string
  costo_unitario: number
  saldo_existencias: number
  categoria: string
}

type ProductoSearchProps = {
  value: string
  onChange: (val: string) => void
  onSelect: (item: InvItem) => void
  placeholder?: string
}

// Combo con autocompletado real: carga coincidencias de inventario a medida
// que se escribe (mismo patrón ya usado en Nueva NP / OCs — search-interno,
// requiere sesión, incluye precio/stock según rol). Extraído de
// app/compras/bodega/kardex/page.tsx (HU-036) para reutilizarlo en los demás
// formularios de Bodega que hasta ahora usaban un <select> nativo con los
// ~1.256 productos cargados en memoria.
export function ProductoSearch({ value, onChange, onSelect, placeholder }: ProductoSearchProps) {
  const [resultados, setResultados] = useState<InvItem[]>([])
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 2) { setResultados([]); setAbierto(false); return }
    timerRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/compras/inventario/search-interno?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(Array.isArray(data) ? data : [])
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  function handleSelect(item: InvItem) {
    onSelect(item)
    setAbierto(false)
    setResultados([])
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => (resultados.length > 0 || value.length >= 2) && setAbierto(true)}
        placeholder={placeholder ?? 'Código o descripción...'}
        className="h-9 text-sm"
      />
      {cargando && (
        <span className="absolute right-2 top-2.5 text-xs text-slate-400">buscando...</span>
      )}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias en inventario</li>
          )}
          {resultados.map(item => (
            <li
              key={item.id}
              onMouseDown={() => handleSelect(item)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-xs text-slate-400 mr-2">{item.codigo}</span>
                <span className="text-slate-800">{item.descripcion}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
