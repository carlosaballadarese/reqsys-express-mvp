'use client'

import { useEffect, useState } from 'react'

type Perfil = { id: string; email: string; nombre: string; rol: string; activo: boolean; area_id: string | null }
type Area   = { id: string; nombre: string }

type PassForm = {
  actual: string
  nueva: string
  confirmar: string
  cargando: boolean
  error: string | null
  exito: boolean
}

const PASS_VACIO: PassForm = {
  actual: '', nueva: '', confirmar: '', cargando: false, error: null, exito: false,
}

const ROL_LABEL: Record<string, string> = {
  solicitante:       'Solicitante',
  compras:           'Compras',
  gerencia:          'Gerencia',
  consulta:          'Consulta',
  admin:             'Administrador',
  bodega:            'Bodega',
  coordinador:       'Coordinador',
  asistente_compras: 'Asistente Compras',
}

function policyOk(p: string) {
  return {
    largo:     p.length >= 8,
    mayuscula: /[A-Z]/.test(p),
    numero:    /[0-9]/.test(p),
  }
}

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [areas, setAreas]   = useState<Area[]>([])
  const [pass, setPass]     = useState<PassForm>(PASS_VACIO)

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPerfil(d) })
      .catch(() => {})

    // Spec: SC-006 Decisión 5 — catálogo completo, resuelve el nombre en el cliente
    // en vez de ampliar el contrato de GET /api/auth/perfil para todos sus consumidores
    fetch('/api/compras/areas')
      .then(r => r.ok ? r.json() : [])
      .then(d => setAreas(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // Spec: SC-006 CA-04/CA-05 — reutiliza POST /api/auth/cambiar-password sin tocar su lógica
  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    setPass(p => ({ ...p, cargando: true, error: null }))

    const res  = await fetch('/api/auth/cambiar-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passwordActual:  pass.actual,
        passwordNuevo:   pass.nueva,
        passwordConfirm: pass.confirmar,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setPass(p => ({ ...p, cargando: false, error: data.error ?? 'Error desconocido.' }))
    } else {
      setPass(p => ({ ...p, cargando: false, exito: true, actual: '', nueva: '', confirmar: '' }))
    }
  }

  const policy    = policyOk(pass.nueva)
  const areaNombre = perfil?.area_id ? areas.find(a => a.id === perfil.area_id)?.nombre ?? null : null

  if (!perfil) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">Cargando...</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mi Perfil</h1>
        <p className="text-slate-400 text-sm mt-1">Tus datos y seguridad de la cuenta.</p>
      </div>

      {/* Datos propios — solo lectura */}
      <div className="bg-white rounded-xl shadow border border-slate-100 overflow-hidden">
        <div className="px-6 py-3" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
          <h2 className="text-white font-semibold text-sm">Datos de la cuenta</h2>
        </div>
        <div className="px-6 py-5">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-400 w-40">Nombre</td>
                <td className="py-2.5 font-medium text-slate-800">{perfil.nombre}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-400">Correo</td>
                <td className="py-2.5 font-medium text-slate-800">{perfil.email}</td>
              </tr>
              <tr className={areaNombre ? 'border-b border-slate-100' : ''}>
                <td className="py-2.5 text-slate-400">Rol</td>
                <td className="py-2.5 font-medium text-slate-800">{ROL_LABEL[perfil.rol] ?? perfil.rol}</td>
              </tr>
              {areaNombre && (
                <tr>
                  <td className="py-2.5 text-slate-400">Área</td>
                  <td className="py-2.5 font-medium text-slate-800">{areaNombre}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cambio de contraseña */}
      <div className="bg-white rounded-xl shadow border border-slate-100 overflow-hidden">
        <div className="px-6 py-3" style={{ background: 'linear-gradient(90deg, #0d2e2e, #1a5252)' }}>
          <h2 className="text-white font-semibold text-sm">Cambiar contraseña</h2>
        </div>

        {pass.exito ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-800 font-semibold mb-1">Contraseña actualizada</p>
            <p className="text-sm text-slate-500 mb-5">Se envió una notificación a tu correo.</p>
            <button
              onClick={() => setPass(PASS_VACIO)}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#1a5252' }}
            >
              Cambiar de nuevo
            </button>
          </div>
        ) : (
          <form onSubmit={handleCambiarPassword} className="px-6 py-5 space-y-4 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña actual</label>
              <input
                type="password"
                value={pass.actual}
                onChange={e => setPass(p => ({ ...p, actual: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={pass.nueva}
                onChange={e => setPass(p => ({ ...p, nueva: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              {pass.nueva.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {[
                    { ok: policy.largo,     label: 'Mínimo 8 caracteres' },
                    { ok: policy.mayuscula, label: 'Al menos una mayúscula' },
                    { ok: policy.numero,    label: 'Al menos un número' },
                  ].map(({ ok, label }) => (
                    <p key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600' : 'text-slate-400'}`}>
                      <span>{ok ? '✓' : '○'}</span>{label}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={pass.confirmar}
                onChange={e => setPass(p => ({ ...p, confirmar: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5252]"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              {pass.confirmar.length > 0 && pass.nueva !== pass.confirmar && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
              )}
            </div>

            {pass.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                {pass.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pass.cargando}
              className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: '#1a5252' }}
            >
              {pass.cargando ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
