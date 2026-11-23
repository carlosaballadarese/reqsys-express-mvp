'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Opcion = { id: string; nombre: string }
type CampoExtra = { key: string; label: string; placeholder?: string; requerido?: boolean }

// Patrón de UX pedido por el usuario: cualquier combo de catálogo que no
// tenga el ítem buscado permite crearlo ahí mismo, sin salir de la pantalla.
// Cubre catálogos simples de 1-2 campos de texto (Bodega, Cliente Final,
// Lugar de Entrega) — Categoría queda fuera a propósito, por su cruce N:M
// con Áreas Técnicas, que no encaja en este patrón genérico.
export function ComboConAlta({
  label, value, onChange, opciones, onCreado, crearEndpoint, construirBody,
  placeholderOpcionVacia = '— seleccionar —', nombrePlaceholder = 'Nombre',
  camposExtra = [],
}: {
  label: string
  value: string
  onChange: (id: string) => void
  opciones: Opcion[]
  onCreado: (nuevo: { id: string; nombre: string }) => void
  crearEndpoint: string
  construirBody: (nombre: string, extra: Record<string, string>) => Record<string, unknown>
  placeholderOpcionVacia?: string
  nombrePlaceholder?: string
  camposExtra?: CampoExtra[]
}) {
  const [agregando, setAgregando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function crear() {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) { setError('El nombre es requerido'); return }
    for (const c of camposExtra) {
      if (c.requerido && !extra[c.key]?.trim()) { setError(`${c.label} es requerido`); return }
    }
    setGuardando(true); setError('')
    try {
      const res = await fetch(crearEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(construirBody(nombreLimpio, extra)),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear'); return }
      onCreado({ id: data.id, nombre: data.nombre })
      onChange(data.id)
      setAgregando(false); setNombre(''); setExtra({})
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button
          type="button"
          onClick={() => { setAgregando((v) => !v); setError('') }}
          className="text-xs text-blue-600 hover:underline"
        >
          {agregando ? 'Cancelar' : '+ Nuevo'}
        </button>
      </div>
      {!agregando ? (
        <select
          className="border rounded px-2 py-1 text-sm w-full h-9 mt-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholderOpcionVacia}</option>
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      ) : (
        <div className="border rounded p-2 mt-1 bg-blue-50 space-y-2">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={nombrePlaceholder}
            className="h-8 text-sm"
          />
          {camposExtra.map((c) => (
            <Input
              key={c.key}
              value={extra[c.key] ?? ''}
              onChange={(e) => setExtra((prev) => ({ ...prev, [c.key]: e.target.value }))}
              placeholder={c.placeholder ?? c.label}
              className="h-8 text-sm"
            />
          ))}
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <Button type="button" size="sm" onClick={crear} disabled={guardando} className="h-7 text-xs btn-primary px-3">
            {guardando ? 'Creando...' : 'Crear'}
          </Button>
        </div>
      )}
    </div>
  )
}
