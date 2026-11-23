'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/lib/toast'

type TipoIngreso = { id: string; codigo: string; nombre: string; activo: boolean }

// Spec: HU-037 CA-06 — solo listado + toggle activo. Sin "crear tipo nuevo" y
// sin DELETE físico (RN-01/RN-03): un tipo nuevo quedaría sin comportamiento
// programado en el motor de Kardex.
export default function TiposIngresoPage() {
  const [tipos, setTipos] = useState<TipoIngreso[]>([])
  const [cargando, setCargando] = useState(true)

  function cargar() {
    setCargando(true)
    fetch('/api/compras/bodega/tipos-ingreso?todas=1')
      .then(r => r.json())
      .then(data => { setTipos(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  async function toggleActivo(t: TipoIngreso) {
    const res  = await fetch(`/api/compras/bodega/tipos-ingreso/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !t.activo }),
    })
    const data = await res.json()
    if (data.success) cargar()
    else toast.error(data.error || 'Error al actualizar')
  }

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tipos de Ingreso</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Desactivar un tipo no afecta a ningún Documento de Ingreso ya creado con él — solo
            deja de ofrecerse en documentos nuevos. No se pueden agregar tipos nuevos: cada uno
            tiene reglas de negocio propias programadas en el motor de Kardex.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${tipos.length} Tipos de Ingreso`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 pr-4 w-32">Código</th>
                      <th className="text-left py-3 pr-4">Nombre</th>
                      <th className="text-left py-3 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tipos.map(t => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-mono text-xs">
                          <span className={t.activo ? '' : 'text-slate-400'}>{t.codigo}</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          <span className={t.activo ? '' : 'text-slate-400'}>{t.nombre}</span>
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => toggleActivo(t)}
                            className={`text-xs px-2 py-0.5 rounded-full border ${t.activo ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}`}
                          >
                            {t.activo ? 'Activo' : 'Inactivo'}
                          </button>
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
    </div>
  )
}
