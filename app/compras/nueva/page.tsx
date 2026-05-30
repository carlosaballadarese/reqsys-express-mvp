'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

const itemSchema = z.object({
  codigo:              z.string(),
  descripcion:         z.string().min(1, 'Requerido'),
  unidad:              z.string().min(1, 'Requerido'),
  cantidad:            z.string().min(1, 'Requerido'),
  precio_unitario:     z.string(),
  proveedor_sugerido:  z.string(),
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

type EstadoEnvio = 'idle' | 'enviando' | 'exitoso' | 'error'

type InvItem = {
  id: string
  codigo: string
  descripcion: string
  costo_unitario: number
  saldo_existencias: number
  categoria: string
}

type InventarioSearchProps = {
  value: string
  onChange: (val: string) => void
  onSelect: (item: InvItem) => void
}

function InventarioSearch({ value, onChange, onSelect }: InventarioSearchProps) {
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
        const res = await fetch(`/api/compras/inventario/search?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        setResultados(data)
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
        placeholder="Busca por descripción o código AL-I..."
        className="mt-1 h-8 text-sm"
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

function TotalEstimado({ control, puedeVer }: { control: ReturnType<typeof useForm<FormData>>['control']; puedeVer: boolean }) {
  const items = useWatch({ control, name: 'items' })
  const total = (items ?? []).reduce(
    (acc, item) => acc + (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0),
    0
  )
  if (!puedeVer) return null
  return (
    <div className="flex justify-end pt-2 border-t">
      <div className="text-right">
        <span className="text-sm text-slate-500">Total Estimado:</span>
        <span className="ml-3 text-lg font-bold text-blue-700">${total.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function NuevaNotaPedido() {
  const [estado, setEstado]           = useState<EstadoEnvio>('idle')
  const [numeroNP, setNumeroNP]       = useState('')
  const [errorMsg, setErrorMsg]       = useState('')
  const [areas, setAreas]             = useState<string[]>([])
  const [unidades, setUnidades]       = useState<string[]>(['EA'])
  const [puedeVerPrecio, setPuedeVerPrecio] = useState(false)

  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [resAreas, resUnidades, resPerfil] = await Promise.all([
          fetch('/api/compras/areas'),
          fetch('/api/compras/unidades'),
          fetch('/api/auth/perfil'),
        ])
        if (resAreas.ok)   setAreas(await resAreas.json())
        if (resUnidades.ok) setUnidades(await resUnidades.json())
        if (resPerfil.ok) {
          const p = await resPerfil.json()
          setPuedeVerPrecio(['compras', 'admin', 'asistente_compras'].includes(p.rol ?? ''))
        }
      } catch (err) {
        console.error('Error cargando catálogos:', err)
      }
    }
    loadCatalogs()
  }, [])

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prioridad: 'media',
      tipo_compra: 'producto',
      centro_costo: 'costo',
      items: [{ codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0', proveedor_sugerido: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // Spec: separar validación de envío para insertar modal de confirmación
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const [datosPendientes, setDatosPendientes] = useState<FormData | null>(null)

  function handleValidarYAbrir(data: FormData) {
    setDatosPendientes(data)
    setModalConfirmar(true)
  }

  async function onSubmit(data: FormData) {
    setEstado('enviando')
    setErrorMsg('')
    const itemsPayload: ItemPayload[] = data.items.map((item) => ({
      codigo: item.codigo || '',
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario) || 0,
    }))
    try {
      const res = await fetch('/api/compras/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encabezado: data, items: itemsPayload }),
      })
      const result = await res.json()
      if (result.success) {
        setNumeroNP(result.numero)
        setEstado('exitoso')
        reset()
      } else {
        setErrorMsg(result.error || 'Error al enviar la NP')
        setEstado('error')
      }
    } catch {
      setErrorMsg('Error de conexión. Intenta nuevamente.')
      setEstado('error')
    }
  }

  if (estado === 'exitoso') {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-semibold">Nota de Pedido enviada</h2>
            <p className="text-slate-600">
              Tu solicitud <strong>{numeroNP}</strong> fue registrada y enviada al coordinador del área para su aprobación.
            </p>
            <p className="text-sm text-slate-400">Recibirás un email cuando sea aprobada o rechazada.</p>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => setEstado('idle')}>Nueva NP</Button>
              <Link href="/compras">
                <Button variant="outline">Ver mis NPs</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Nueva Nota de Pedido</h1>
          <p className="text-slate-500 text-sm mt-1">ARLIFT S.A. — Sistema de Gestión de Requerimientos</p>
        </div>

        <form
          className="space-y-6"
          onKeyDown={e => {
            // Spec: Enter no envía el formulario (excepto en textarea y select que conservan su comportamiento nativo)
            if (e.key === 'Enter'
              && !(e.target instanceof HTMLTextAreaElement)
              && !(e.target instanceof HTMLSelectElement)) {
              e.preventDefault()
            }
          }}
        >
          {/* Datos del solicitante */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">Datos del Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="solicitante_nombre">Nombre completo *</Label>
                <Input
                  id="solicitante_nombre"
                  {...register('solicitante_nombre')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      // Spec: Enter en Nombre mueve el foco al campo Email
                      ;(document.getElementById('solicitante_email') as HTMLInputElement | null)?.focus()
                    }
                  }}
                  className="mt-1"
                />
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
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                {errors.area && <p className="text-red-500 text-xs mt-1">{errors.area.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="prioridad">Prioridad *</Label>
                  <select
                    id="prioridad"
                    {...register('prioridad')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="baja">Baja (16-30d)</option>
                    <option value="media">Media (4-15d)</option>
                    <option value="alta">Alta (1-3d)</option>
                    <option value="excepcional">Excepcional</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="tipo_compra">Tipo de Compra *</Label>
                  <select
                    id="tipo_compra"
                    {...register('tipo_compra')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                    <option value="alquiler">Alquiler</option>
                    <option value="importacion">Importación</option>
                    <option value="consumible">Consumible</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="centro_costo">Centro de Costo *</Label>
                  <select
                    id="centro_costo"
                    {...register('centro_costo')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
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
                      {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Cantidad *</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.cantidad`}
                      render={({ field }) => (
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={field.value}
                          onChange={e => field.onChange(e.target.value)}
                          className="mt-1 h-8 text-sm"
                        />
                      )}
                    />
                    {errors.items?.[index]?.cantidad && (
                      <p className="text-red-500 text-xs mt-1">{errors.items[index]?.cantidad?.message}</p>
                    )}
                  </div>
                  {/* Spec: precio solo visible para compras, admin y asistente_compras */}
                  {puedeVerPrecio && (
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">P. Unit. USD</Label>
                      <Controller
                        control={control}
                        name={`items.${index}.precio_unitario`}
                        render={({ field }) => (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={field.value}
                            onChange={e => field.onChange(e.target.value)}
                            className="mt-1 h-8 text-sm"
                          />
                        )}
                      />
                    </div>
                  )}
                  <div className="col-span-12 sm:col-span-1 flex items-end justify-end">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 mt-4"
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                  {/* Proveedor sugerido — campo opcional, visible para todos */}
                  <div className="col-span-12">
                    <Label className="text-xs text-slate-500">Proveedor Sugerido (opcional)</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.proveedor_sugerido`}
                      render={({ field }) => (
                        <Input
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value)}
                          placeholder="Nombre del proveedor recomendado para este ítem"
                          className="mt-1 h-8 text-sm"
                        />
                      )}
                    />
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ codigo: '', descripcion: '', unidad: 'EA', cantidad: '1', precio_unitario: '0', proveedor_sugerido: '' })}
                className="w-full"
              >
                + Agregar ítem
              </Button>

              <TotalEstimado control={control} puedeVer={puedeVerPrecio} />
            </CardContent>
          </Card>

          {estado === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Spec: envío solo mediante clic explícito, no por Enter */}
          <Button
            type="button"
            disabled={estado === 'enviando'}
            onClick={handleSubmit(handleValidarYAbrir)}
            className="w-full h-12 text-base btn-primary"
          >
            {estado === 'enviando' ? 'Enviando...' : 'Enviar Nota de Pedido'}
          </Button>
        </form>
      </div>

      {/* Spec: modal de confirmación antes de enviar — solo se abre tras validación Zod exitosa */}
      {modalConfirmar && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalConfirmar(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
              <h2 className="text-white font-semibold text-base">Confirmar envío</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(201,168,64,0.9)' }}>Nota de Pedido</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-700">
                ¿Deseas enviar esta NP a aprobación? Se notificará al Coordinador del área por correo electrónico.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalConfirmar(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { setModalConfirmar(false); if (datosPendientes) onSubmit(datosPendientes) }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ background: '#1a5252' }}
                >
                  Sí, enviar NP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
