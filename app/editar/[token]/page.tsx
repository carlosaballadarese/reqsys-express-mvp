'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const itemSchema = z.object({
  codigo: z.string(),
  descripcion: z.string().min(1, 'Requerido'),
  unidad: z.string().min(1, 'Requerido'),
  cantidad: z.string().min(1, 'Requerido'),
  precio_unitario: z.string(),
})

const formSchema = z.object({
  solicitante_nombre: z.string().min(2, 'Requerido'),
  solicitante_email: z.string().email('Email inválido'),
  area: z.string().min(1, 'Selecciona un área'),
  prioridad: z.enum(['excepcional', 'alta', 'media', 'baja']),
  tipo_compra: z.enum(['producto', 'servicio', 'alquiler', 'importacion', 'consumible']),
  centro_costo: z.enum(['costo', 'gasto', 'activo', 'inventario']),
  descripcion_general: z.string().min(10, 'Mínimo 10 caracteres'),
  items: z.array(itemSchema).min(1, 'Agrega al menos un ítem'),
})

type FormData = z.infer<typeof formSchema>

type ItemPayload = {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
}

type InvItem = {
  id: string
  codigo: string
  descripcion: string
  costo_unitario: number
  saldo_existencias: number
  categoria: string
}

const AREAS = [
  'Operaciones - Bombeo Mecánico',
  'Operaciones - Servicio Eléctrico',
  'Operaciones - Niveles',
  'Compras',
  'QHSE',
  'TTHH',
  'Finanzas',
  'Gerencia',
  'Ventas',
]

const UNIDADES = ['EA', 'UN', 'M', 'ML', 'KG', 'LT', 'GL', 'M2', 'M3', 'JGO', 'RLL', 'CJA', 'PAR', 'HRS']

// ─── Búsqueda con autocomplete ────────────────────────────────────────────────

function InventarioSearch({ value, onChange, onSelect }: {
  value: string
  onChange: (val: string) => void
  onSelect: (item: InvItem) => void
}) {
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
        const res = await fetch(`/api/inventario/search?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(data)
        setAbierto(true)
      } finally {
        setCargando(false)
      }
    }, 300)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => (resultados.length > 0 || value.length >= 2) && setAbierto(true)}
        placeholder="Busca por descripción o código AL-I..."
        className="mt-1 h-8 text-sm"
      />
      {cargando && <span className="absolute right-2 top-2.5 text-xs text-slate-400">buscando...</span>}
      {abierto && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
          {resultados.length === 0 && !cargando && (
            <li className="px-3 py-2 text-slate-400 text-xs italic">Sin coincidencias en inventario</li>
          )}
          {resultados.map(item => (
            <li
              key={item.id}
              onMouseDown={() => { onSelect(item); setAbierto(false); setResultados([]) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-xs text-slate-400 mr-2">{item.codigo}</span>
                <span className="text-slate-800">{item.descripcion}</span>
              </div>
              <div className="flex gap-2 shrink-0 ml-2">
                <span className="text-xs text-green-600">Stock: {Number(item.saldo_existencias ?? 0).toFixed(0)}</span>
                {item.costo_unitario > 0 && (
                  <span className="text-xs text-blue-600">${Number(item.costo_unitario).toFixed(2)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Total Estimado ───────────────────────────────────────────────────────────

function TotalEstimado({ control }: { control: ReturnType<typeof useForm<FormData>>['control'] }) {
  const items = useWatch({ control, name: 'items' })
  const total = (items ?? []).reduce(
    (acc, item) => acc + (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0),
    0
  )
  return (
    <div className="flex justify-end pt-2 border-t">
      <div className="text-right">
        <span className="text-sm text-slate-500">Total Estimado:</span>
        <span className="ml-3 text-lg font-bold text-blue-700">${total.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type PageEstado = 'cargando' | 'listo' | 'enviando' | 'exitoso' | 'error_carga' | 'error_envio'

export default function EditarNP() {
  const params = useParams()
  const token = params.token as string

  const [pageEstado, setPageEstado] = useState<PageEstado>('cargando')
  const [motivoDevolucion, setMotivoDevolucion] = useState('')
  const [numeroNP, setNumeroNP] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const {
    register, control, handleSubmit, reset, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prioridad: 'media',
      tipo_compra: 'producto',
      centro_costo: 'costo',
      items: [{ codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    fetch(`/api/editar/${token}`)
      .then(r => r.json())
      .then(({ np, items }) => {
        if (!np) { setPageEstado('error_carga'); return }
        setMotivoDevolucion(np.motivo_devolucion || '')
        setNumeroNP(np.numero)
        reset({
          solicitante_nombre: np.solicitante_nombre,
          solicitante_email: np.solicitante_email,
          area: np.area,
          prioridad: np.prioridad,
          tipo_compra: np.tipo_compra,
          centro_costo: np.centro_costo,
          descripcion_general: np.descripcion_general,
          items: items.map((i: { codigo: string; descripcion: string; unidad: string; cantidad: number; precio_unitario: number }) => ({
            codigo: i.codigo || '',
            descripcion: i.descripcion,
            unidad: i.unidad,
            cantidad: String(i.cantidad),
            precio_unitario: String(i.precio_unitario),
          })),
        })
        setPageEstado('listo')
      })
      .catch(() => setPageEstado('error_carga'))
  }, [token, reset])

  async function onSubmit(data: FormData) {
    setPageEstado('enviando')
    setErrorMsg('')
    const itemsPayload: ItemPayload[] = data.items.map(item => ({
      codigo: item.codigo || '',
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario) || 0,
    }))
    try {
      const res = await fetch(`/api/editar/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encabezado: data, items: itemsPayload }),
      })
      const result = await res.json()
      if (result.success) {
        setPageEstado('exitoso')
      } else {
        setErrorMsg(result.error || 'Error al enviar la NP')
        setPageEstado('error_envio')
      }
    } catch {
      setErrorMsg('Error de conexión. Intenta nuevamente.')
      setPageEstado('error_envio')
    }
  }

  if (pageEstado === 'cargando') {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando solicitud...</div>
  }

  if (pageEstado === 'error_carga') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">Enlace no válido</h2>
            <p className="text-slate-500">Esta solicitud no está disponible para edición.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (pageEstado === 'exitoso') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-semibold">Solicitud reenviada</h2>
            <p className="text-slate-600">
              Tu Nota de Pedido <strong>{numeroNP}</strong> fue corregida y enviada al coordinador del área para su aprobación.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Corregir Nota de Pedido</h1>
          <p className="text-slate-500 text-sm mt-1">{numeroNP} — ARLIFT S.A.</p>
        </div>

        {/* Motivo de devolución */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold text-amber-800 mb-1">Motivo de devolución por Compras:</p>
          <p className="text-sm text-amber-900">{motivoDevolucion}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Datos del solicitante */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">Datos del Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="solicitante_nombre">Nombre completo *</Label>
                <Input id="solicitante_nombre" {...register('solicitante_nombre')} className="mt-1" />
                {errors.solicitante_nombre && <p className="text-red-500 text-xs mt-1">{errors.solicitante_nombre.message}</p>}
              </div>
              <div>
                <Label htmlFor="solicitante_email">Email corporativo *</Label>
                <Input id="solicitante_email" type="email" {...register('solicitante_email')} className="mt-1" />
                {errors.solicitante_email && <p className="text-red-500 text-xs mt-1">{errors.solicitante_email.message}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Información general */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="area">Área / Departamento *</Label>
                <select
                  id="area"
                  {...register('area')}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Selecciona un área...</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {errors.area && <p className="text-red-500 text-xs mt-1">{errors.area.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="prioridad">Prioridad *</Label>
                  <select id="prioridad" {...register('prioridad')} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="baja">Baja (16-30d)</option>
                    <option value="media">Media (4-15d)</option>
                    <option value="alta">Alta (1-3d)</option>
                    <option value="excepcional">Excepcional</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="tipo_compra">Tipo de Compra *</Label>
                  <select id="tipo_compra" {...register('tipo_compra')} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                    <option value="alquiler">Alquiler</option>
                    <option value="importacion">Importación</option>
                    <option value="consumible">Consumible</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="centro_costo">Centro de Costo *</Label>
                  <select id="centro_costo" {...register('centro_costo')} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="costo">Costo</option>
                    <option value="gasto">Gasto</option>
                    <option value="activo">Activo</option>
                    <option value="inventario">Inventario</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="descripcion_general">Descripción General *</Label>
                <Textarea
                  id="descripcion_general"
                  {...register('descripcion_general')}
                  placeholder="Describe el propósito del requerimiento..."
                  className="mt-1 min-h-[80px]"
                />
                {errors.descripcion_general && <p className="text-red-500 text-xs mt-1">{errors.descripcion_general.message}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Tabla de ítems */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">Ítems del Requerimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start border rounded-md p-3 bg-slate-50">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-xs">Descripción *</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.descripcion`}
                      render={({ field }) => (
                        <InventarioSearch
                          value={field.value ?? ''}
                          onChange={val => field.onChange(val)}
                          onSelect={inv => {
                            field.onChange(inv.descripcion)
                            setValue(`items.${index}.codigo`, inv.codigo, { shouldDirty: true })
                            if (inv.costo_unitario > 0) {
                              setValue(`items.${index}.precio_unitario`, String(inv.costo_unitario), { shouldDirty: true })
                            }
                          }}
                        />
                      )}
                    />
                    {errors.items?.[index]?.descripcion && (
                      <p className="text-red-500 text-xs mt-1">{errors.items[index]?.descripcion?.message}</p>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Unidad *</Label>
                    <select
                      {...register(`items.${index}.unidad`)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-8"
                    >
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Cantidad *</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.cantidad`}
                      render={({ field }) => (
                        <Input type="number" step="0.01" min="0.01" value={field.value} onChange={e => field.onChange(e.target.value)} className="mt-1 h-8 text-sm" />
                      )}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">P. Unit. USD</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.precio_unitario`}
                      render={({ field }) => (
                        <Input type="number" step="0.01" min="0" value={field.value} onChange={e => field.onChange(e.target.value)} className="mt-1 h-8 text-sm" />
                      )}
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-1 flex items-end justify-end">
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 mt-4">
                        ✕
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0' })}
                className="w-full"
              >
                + Agregar ítem
              </Button>

              <TotalEstimado control={control} />
            </CardContent>
          </Card>

          {pageEstado === 'error_envio' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm">
              {errorMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={pageEstado === 'enviando'}
            className="w-full h-12 text-base bg-blue-700 hover:bg-blue-800"
          >
            {pageEstado === 'enviando' ? 'Enviando...' : 'Reenviar Nota de Pedido corregida'}
          </Button>
        </form>
      </div>
    </div>
  )
}
