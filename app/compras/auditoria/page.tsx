'use client'

import { useState, useEffect, useCallback } from 'react'

type Registro = {
  id: string
  created_at: string
  usuario_email: string
  usuario_nombre: string
  rol: string
  accion: string
  entidad: string
  referencia: string
  detalle: Record<string, unknown> | null
}

const ACCION_LABEL: Record<string, string> = {
  crear_oc:               'Crear OC',
  editar_oc:              'Editar OC',
  cambiar_estado_oc:      'Cambiar estado OC',
  convertir_np_a_oc:      'Convertir NP → OC',
  crear_proveedor:        'Crear proveedor',
  editar_proveedor:       'Editar proveedor',
  crear_item_inventario:  'Crear ítem inventario',
  editar_item_inventario: 'Editar ítem inventario',
  crear_usuario:          'Crear usuario',
  editar_usuario:         'Editar usuario',
  reset_password:         'Reset contraseña',
}

const ACCION_COLOR: Record<string, string> = {
  crear_oc:               'bg-blue-100 text-blue-800',
  editar_oc:              'bg-yellow-100 text-yellow-800',
  cambiar_estado_oc:      'bg-purple-100 text-purple-800',
  convertir_np_a_oc:      'bg-green-100 text-green-800',
  crear_proveedor:        'bg-blue-100 text-blue-800',
  editar_proveedor:       'bg-yellow-100 text-yellow-800',
  crear_item_inventario:  'bg-blue-100 text-blue-800',
  editar_item_inventario: 'bg-yellow-100 text-yellow-800',
  crear_usuario:          'bg-green-100 text-green-800',
  editar_usuario:         'bg-yellow-100 text-yellow-800',
  reset_password:         'bg-red-100 text-red-800',
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AuditoriaPage() {
  const [registros, setRegistros]   = useState<Registro[]>([])
  const [cargando, setCargando]     = useState(true)
  const [detalleFila, setDetalleFila] = useState<string | null>(null)

  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroAccion, setFiltroAccion]   = useState('')
  const [filtroEntidad, setFiltroEntidad] = useState('')
  const [filtroDesde, setFiltroDesde]     = useState('')
  const [filtroHasta, setFiltroHasta]     = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtroUsuario) params.set('usuario', filtroUsuario)
    if (filtroAccion)  params.set('accion', filtroAccion)
    if (filtroEntidad) params.set('entidad', filtroEntidad)
    if (filtroDesde)   params.set('desde', filtroDesde)
    if (filtroHasta)   params.set('hasta', filtroHasta)

    const res = await fetch(`/api/auditoria?${params}`)
    if (res.ok) setRegistros(await res.json())
    setCargando(false)
  }, [filtroUsuario, filtroAccion, filtroEntidad, filtroDesde, filtroHasta])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800 mb-5">Auditoría del Sistema</h1>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder="Usuario (email)"
          value={filtroUsuario}
          onChange={e => setFiltroUsuario(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
        />
        <select
          value={filtroAccion}
          onChange={e => setFiltroAccion(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACCION_LABEL).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          value={filtroEntidad}
          onChange={e => setFiltroEntidad(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Todas las entidades</option>
          <option value="orden_compra">Orden de Compra</option>
          <option value="proveedor">Proveedor</option>
          <option value="inventario">Inventario</option>
          <option value="usuario">Usuario</option>
        </select>
        <input
          type="date"
          value={filtroDesde}
          onChange={e => setFiltroDesde(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
          title="Desde"
        />
        <input
          type="date"
          value={filtroHasta}
          onChange={e => setFiltroHasta(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
          title="Hasta"
        />
      </div>

      {cargando ? (
        <p className="text-slate-500 text-sm">Cargando...</p>
      ) : registros.length === 0 ? (
        <p className="text-slate-500 text-sm">No hay registros con los filtros aplicados.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Fecha</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Usuario</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Rol</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Acción</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Referencia</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registros.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap text-xs">{formatFecha(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800">{r.usuario_nombre ?? '—'}</p>
                    <p className="text-xs text-slate-500">{r.usuario_email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-2 text-slate-600 capitalize text-xs">{r.rol ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACCION_COLOR[r.accion] ?? 'bg-slate-100 text-slate-700'}`}>
                      {ACCION_LABEL[r.accion] ?? r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-700 text-xs max-w-[180px] truncate">{r.referencia ?? '—'}</td>
                  <td className="px-4 py-2">
                    {r.detalle ? (
                      <button
                        onClick={() => setDetalleFila(detalleFila === r.id ? null : r.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {detalleFila === r.id ? 'Ocultar' : 'Ver'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    {detalleFila === r.id && r.detalle && (
                      <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap max-w-[300px]">
                        {JSON.stringify(r.detalle, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">
            {registros.length} registro{registros.length !== 1 ? 's' : ''} — máx. 500
          </p>
        </div>
      )}
    </div>
  )
}
