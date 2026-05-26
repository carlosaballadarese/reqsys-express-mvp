'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Usuario = {
  id: string
  email: string
  nombre: string
  rol: string
  activo: boolean
  created_at: string
}

const ROLES = ['solicitante', 'bodega', 'coordinador', 'asistente_compras', 'compras', 'gerencia', 'consulta', 'admin']

const ROL_BADGE: Record<string, string> = {
  solicitante:       'bg-slate-100 text-slate-600',
  bodega:            'bg-amber-100 text-amber-700',
  coordinador:       'bg-green-100 text-green-700',
  asistente_compras: 'bg-cyan-100 text-cyan-700',
  compras:           'bg-blue-100 text-blue-700',
  gerencia:          'bg-purple-100 text-purple-700',
  consulta:          'bg-teal-100 text-teal-700',
  admin:             'bg-red-100 text-red-700',
}

const ROL_LABEL: Record<string, string> = {
  solicitante:       'Solicitante',
  bodega:            'Bodega',
  coordinador:       'Coordinador',
  asistente_compras: 'Asistente Compras',
  compras:           'Compras',
  gerencia:          'Gerencia',
  consulta:          'Consulta',
  admin:             'Administrador',
}

export default function AccesosPage() {
  const [usuarios, setUsuarios]   = useState<Usuario[]>([])
  const [cargando, setCargando]   = useState(true)
  const [miId, setMiId]           = useState('')
  const [miRol, setMiRol]         = useState('')

  // Modal nuevo usuario
  const [showNuevo, setShowNuevo]               = useState(false)
  const [nuevoForm, setNuevoForm]               = useState({ email: '', nombre: '', rol: 'solicitante', password: '' })
  const [guardandoNuevo, setGuardandoNuevo]     = useState(false)
  const [errorNuevo, setErrorNuevo]             = useState('')

  // Edición inline
  const [editandoId, setEditandoId]             = useState<string | null>(null)
  const [editForm, setEditForm]                 = useState({ nombre: '', rol: '', activo: true, email: '' })
  const [guardandoEdit, setGuardandoEdit]       = useState(false)
  const [errorEdit, setErrorEdit]               = useState('')

  // Reset contraseña
  const [resetId, setResetId]                   = useState<string | null>(null)
  const [newPassword, setNewPassword]           = useState('')
  const [guardandoReset, setGuardandoReset]     = useState(false)
  const [errorReset, setErrorReset]             = useState('')

  // Eliminar usuario
  const [eliminarUsuario, setEliminarUsuario]   = useState<Usuario | null>(null)
  const [eliminando, setEliminando]             = useState(false)
  const [errorEliminar, setErrorEliminar]       = useState('')
  const [bloqueoEliminar, setBloqueoEliminar]   = useState<{ nps_activas: number; ocs_activas: number } | null>(null)

  function cargar() {
    setCargando(true)
    fetch('/api/admin/usuarios')
      .then(r => r.json())
      .then(data => { setUsuarios(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => {
    cargar()
    fetch('/api/auth/perfil')
      .then(r => r.json())
      .then(p => { setMiId(p.id ?? ''); setMiRol(p.rol ?? '') })
      .catch(() => {})
  }, [])

  async function handleCrear() {
    if (!nuevoForm.email || !nuevoForm.nombre || !nuevoForm.password) {
      setErrorNuevo('Email, nombre y contraseña son requeridos'); return
    }
    if (nuevoForm.password.length < 8) {
      setErrorNuevo('La contraseña debe tener al menos 8 caracteres'); return
    }
    setGuardandoNuevo(true); setErrorNuevo('')
    const res  = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoForm),
    })
    const data = await res.json()
    if (data.success) {
      setShowNuevo(false)
      setNuevoForm({ email: '', nombre: '', rol: 'solicitante', password: '' })
      cargar()
    } else {
      setErrorNuevo(data.error || 'Error al crear usuario')
    }
    setGuardandoNuevo(false)
  }

  function iniciarEdicion(u: Usuario) {
    setEditandoId(u.id)
    setEditForm({ nombre: u.nombre, rol: u.rol, activo: u.activo, email: u.email })
    setErrorEdit('')
    setResetId(null)
  }

  async function handleGuardarEdit() {
    if (!editForm.nombre) { setErrorEdit('El nombre es requerido'); return }
    setGuardandoEdit(true); setErrorEdit('')
    const res  = await fetch(`/api/admin/usuarios/${editandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (data.success) { setEditandoId(null); cargar() }
    else setErrorEdit(data.error || 'Error al guardar')
    setGuardandoEdit(false)
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) {
      setErrorReset('Mínimo 8 caracteres'); return
    }
    setGuardandoReset(true); setErrorReset('')
    const res  = await fetch(`/api/admin/usuarios/${resetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    const data = await res.json()
    if (data.success) { setResetId(null); setNewPassword('') }
    else setErrorReset(data.error || 'Error al actualizar')
    setGuardandoReset(false)
  }

  function abrirEliminar(u: Usuario) {
    setEliminarUsuario(u)
    setErrorEliminar('')
    setBloqueoEliminar(null)
  }

  async function handleEliminar() {
    if (!eliminarUsuario) return
    setEliminando(true); setErrorEliminar(''); setBloqueoEliminar(null)

    const res  = await fetch(`/api/admin/usuarios/${eliminarUsuario.id}`, { method: 'DELETE' })
    const data = await res.json()

    if (res.ok && data.success) {
      setEliminarUsuario(null)
      cargar()
    } else if (res.status === 400 && data.nps_activas !== undefined) {
      // Spec: bloqueo por registros activos
      setBloqueoEliminar({ nps_activas: data.nps_activas, ocs_activas: data.ocs_activas })
      setErrorEliminar(data.error)
    } else {
      setErrorEliminar(data.error || 'Error al eliminar')
    }
    setEliminando(false)
  }

  // Spec: compras no puede editar ni eliminar usuarios admin
  const puedeGestionar = (u: Usuario) =>
    miRol === 'admin' || u.rol !== 'admin'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="page-header px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/compras" className="text-blue-300 text-xs hover:text-white">← NPs</Link>
            <h1 className="text-xl font-bold mt-1">Gestión de Accesos</h1>
          </div>
          <div className="flex gap-2">
            <a href="/api/exportar/coordinadores" download>
              <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 text-sm">⬇ Coordinadores</Button>
            </a>
            <Button onClick={() => { setShowNuevo(true); setErrorNuevo('') }}
              className="bg-white text-[#0d2e2e] hover:bg-slate-50 text-sm font-semibold">
              + Nuevo Usuario
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {/* Modal nuevo usuario */}
        {showNuevo && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-blue-800">Crear Nuevo Usuario</CardTitle>
                <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nombre completo *</Label>
                  <Input value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Nombre Apellido" />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={nuevoForm.email} onChange={e => setNuevoForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="usuario@arlift.com.ec" />
                </div>
                <div>
                  <Label className="text-xs">Rol *</Label>
                  <select value={nuevoForm.rol} onChange={e => setNuevoForm(f => ({ ...f, rol: e.target.value }))}
                    className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    {ROLES.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Contraseña inicial *</Label>
                  <Input type="password" value={nuevoForm.password} onChange={e => setNuevoForm(f => ({ ...f, password: e.target.value }))}
                    className="mt-1 h-8 text-sm" placeholder="Mínimo 8 caracteres" />
                </div>
              </div>
              {errorNuevo && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{errorNuevo}</p>}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="btn-primary">
                  {guardandoNuevo ? 'Creando...' : 'Crear Usuario'}
                </Button>
                <Button variant="outline" onClick={() => setShowNuevo(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista usuarios */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              {cargando ? 'Cargando...' : `${usuarios.length} usuarios`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="text-center py-10 text-slate-400">Cargando...</div>
            ) : (
              <div className="space-y-2">
                {usuarios.map(u => (
                  <div key={u.id} className="border rounded-lg p-4 bg-white">
                    {editandoId === u.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Nombre</Label>
                            <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                              className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Correo electrónico</Label>
                            <Input
                              type="email"
                              value={editForm.email}
                              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                              className="mt-1 h-8 text-sm font-mono"
                              disabled={u.id === miId}
                              title={u.id === miId ? 'No puedes cambiar tu propio correo' : ''}
                            />
                            {u.id === miId && (
                              <p className="text-xs text-slate-400 mt-0.5">No puedes cambiar tu propio correo.</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs">Rol</Label>
                            <select value={editForm.rol} onChange={e => setEditForm(f => ({ ...f, rol: e.target.value }))}
                              className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                              {ROLES.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                            </select>
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={editForm.activo}
                                onChange={e => setEditForm(f => ({ ...f, activo: e.target.checked }))} className="rounded" />
                              Activo
                            </label>
                          </div>
                        </div>
                        {errorEdit && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{errorEdit}</p>}
                        <div className="flex gap-2">
                          <Button onClick={handleGuardarEdit} disabled={guardandoEdit} className="h-7 text-xs btn-primary px-3">
                            {guardandoEdit ? 'Guardando...' : 'Guardar'}
                          </Button>
                          <button onClick={() => setResetId(resetId === u.id ? null : u.id)}
                            className="text-xs text-orange-600 hover:underline px-2">
                            Cambiar contraseña
                          </button>
                          <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                        </div>
                        {resetId === u.id && (
                          <div className="bg-orange-50 border border-orange-200 rounded p-3 space-y-2">
                            <Label className="text-xs text-orange-700">Nueva contraseña para {u.nombre}</Label>
                            <div className="flex gap-2">
                              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                placeholder="Mínimo 8 caracteres" className="h-8 text-sm flex-1" />
                              <Button onClick={handleResetPassword} disabled={guardandoReset}
                                className="h-8 text-xs bg-orange-600 hover:bg-orange-700 px-3">
                                {guardandoReset ? '...' : 'Actualizar'}
                              </Button>
                            </div>
                            {errorReset && <p className="text-red-600 text-xs">{errorReset}</p>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-800">{u.nombre}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROL_BADGE[u.rol] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ROL_LABEL[u.rol] ?? u.rol}
                            </span>
                            {!u.activo && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                                Inactivo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {puedeGestionar(u) && (
                            <button onClick={() => iniciarEdicion(u)} className="text-xs text-blue-600 hover:underline">
                              Editar
                            </button>
                          )}
                          {/* Spec: botón eliminar — no aparece para la propia cuenta ni para admins si eres compras */}
                          {puedeGestionar(u) && u.id !== miId && (
                            <button
                              onClick={() => abrirEliminar(u)}
                              className="text-xs text-red-500 hover:text-red-700 hover:underline"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal confirmación de eliminación */}
      {eliminarUsuario && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget && !eliminando) setEliminarUsuario(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4" style={{ background: 'linear-gradient(90deg, #7f1d1d, #991b1b)' }}>
              <h2 className="text-white font-semibold text-base">Eliminar Usuario</h2>
              <p className="text-red-200 text-xs mt-0.5">{eliminarUsuario.email}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!bloqueoEliminar ? (
                <p className="text-sm text-slate-700">
                  ¿Estás seguro de que deseas eliminar a{' '}
                  <span className="font-semibold">{eliminarUsuario.nombre}</span>?
                  Esta acción eliminará la cuenta permanentemente y no se puede deshacer.
                </p>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-amber-800">No se puede eliminar este usuario</p>
                  <p className="text-xs text-amber-700">{errorEliminar}</p>
                  {bloqueoEliminar.nps_activas > 0 && (
                    <p className="text-xs text-amber-700">• {bloqueoEliminar.nps_activas} NP(s) asignadas activas</p>
                  )}
                  {bloqueoEliminar.ocs_activas > 0 && (
                    <p className="text-xs text-amber-700">• {bloqueoEliminar.ocs_activas} OC(s) en proceso</p>
                  )}
                  <p className="text-xs text-amber-600 mt-1">Reasigne o cierre estos registros antes de eliminar el usuario.</p>
                </div>
              )}

              {errorEliminar && !bloqueoEliminar && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{errorEliminar}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEliminarUsuario(null)}
                  disabled={eliminando}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
                {!bloqueoEliminar && (
                  <button
                    onClick={handleEliminar}
                    disabled={eliminando}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
