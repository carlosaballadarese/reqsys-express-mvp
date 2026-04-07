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

const ROLES = ['solicitante', 'compras', 'gerencia', 'consulta', 'admin']

const ROL_BADGE: Record<string, string> = {
  solicitante: 'bg-slate-100 text-slate-600',
  compras:     'bg-blue-100 text-blue-700',
  gerencia:    'bg-purple-100 text-purple-700',
  consulta:    'bg-teal-100 text-teal-700',
  admin:       'bg-red-100 text-red-700',
}

const ROL_LABEL: Record<string, string> = {
  solicitante: 'Solicitante',
  compras:     'Compras',
  gerencia:    'Gerencia',
  consulta:    'Consulta',
  admin:       'Administrador',
}

export default function AccesosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  // Modal nuevo usuario
  const [showNuevo, setShowNuevo]         = useState(false)
  const [nuevoForm, setNuevoForm]         = useState({ email: '', nombre: '', rol: 'solicitante', password: '' })
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)
  const [errorNuevo, setErrorNuevo]       = useState('')

  // Edición inline
  const [editandoId, setEditandoId]       = useState<string | null>(null)
  const [editForm, setEditForm]           = useState({ nombre: '', rol: '', activo: true })
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  // Reset contraseña
  const [resetId, setResetId]             = useState<string | null>(null)
  const [newPassword, setNewPassword]     = useState('')
  const [guardandoReset, setGuardandoReset] = useState(false)
  const [errorReset, setErrorReset]       = useState('')

  function cargar() {
    setCargando(true)
    fetch('/api/admin/usuarios')
      .then(r => r.json())
      .then(data => { setUsuarios(Array.isArray(data) ? data : []); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

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
    setEditForm({ nombre: u.nombre, rol: u.rol, activo: u.activo })
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-800 text-white px-6 py-5">
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
              className="bg-white text-blue-800 hover:bg-blue-50 text-sm font-semibold">
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
                <Button onClick={handleCrear} disabled={guardandoNuevo} className="bg-blue-700 hover:bg-blue-800">
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
                      /* Edición inline */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Nombre</Label>
                            <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                              className="mt-1 h-8 text-sm" />
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
                        {errorEdit && <p className="text-red-600 text-xs">{errorEdit}</p>}
                        <div className="flex gap-2">
                          <Button onClick={handleGuardarEdit} disabled={guardandoEdit} className="h-7 text-xs bg-blue-700 hover:bg-blue-800 px-3">
                            {guardandoEdit ? 'Guardando...' : 'Guardar'}
                          </Button>
                          <button onClick={() => setResetId(resetId === u.id ? null : u.id)}
                            className="text-xs text-orange-600 hover:underline px-2">
                            Cambiar contraseña
                          </button>
                          <button onClick={() => setEditandoId(null)} className="text-xs text-slate-500 hover:underline px-2">Cancelar</button>
                        </div>
                        {/* Reset contraseña inline */}
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
                      /* Vista normal */
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
                          <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                        </div>
                        <button onClick={() => iniciarEdicion(u)} className="text-xs text-blue-600 hover:underline shrink-0">
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
