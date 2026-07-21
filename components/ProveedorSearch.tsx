'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

// Spec: HU-014 Tarea 1 — extraído tal cual de app/compras/[id]/page.tsx (sin cambio de
// comportamiento) para reutilizarlo en el modal de Generación de OC desde Líneas Pendientes.

export type Proveedor = {
  id: string
  nombre: string
  clasificacion: string | null
  categoria: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
}

export function ProveedorSearch({ value, onChange, onSelect }: {
  value: string
  onChange: (val: string) => void
  onSelect: (p: Proveedor) => void
}) {
  const [resultados, setResultados] = useState<Proveedor[]>([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAbierto(false)
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
        const res = await fetch(`/api/compras/proveedores?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(data)
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative mt-1">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Busca por nombre, categoría o contacto..."
        className="h-8 text-sm"
      />
      {cargando && <span className="absolute right-2 top-2 text-xs text-slate-400">buscando...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias</li>
          )}
          {resultados.map(p => (
            <li
              key={p.id}
              onMouseDown={() => { onSelect(p); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{p.nombre}</span>
                {p.clasificacion && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    p.clasificacion === 'CRITICO' ? 'bg-red-100 text-red-700' :
                    p.clasificacion === 'NO CRITICO' ? 'bg-green-100 text-green-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{p.clasificacion}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                {p.categoria && <span>{p.categoria}</span>}
                {p.ciudad && <span>· {p.ciudad}</span>}
                {p.contacto && <span>· {p.contacto}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
