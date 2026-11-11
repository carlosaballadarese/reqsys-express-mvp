'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { itemsVisibles, NAV, type Rol } from '@/lib/nav-config'

type Perfil = { rol: string }

export default function ReportesPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  useEffect(() => {
    fetch('/api/auth/perfil')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPerfil(d) })
      .catch(() => {})
  }, [])

  if (!perfil) return <div className="p-8 text-sm text-slate-500">Cargando…</div>

  // Spec: SC-008-v2.md CA-08/CA-09 — mismo grupo "Reportes" de lib/nav-config.ts,
  // sin duplicar la lógica de visibilidad por rol.
  const grupo = NAV.find(g => g.label === 'Reportes')!
  const items = itemsVisibles(grupo, perfil.rol as Rol)

  const dashboards = items.filter(i => i.label.startsWith('Dashboard'))
  const excel       = items.filter(i => !i.label.startsWith('Dashboard'))

  return (
    <div className="bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Reportes</h1>

        {dashboards.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Dashboards</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {dashboards.map(i => (
                <Link key={i.href} href={i.href} className="block text-sm text-teal-700 hover:underline">{i.label}</Link>
              ))}
            </CardContent>
          </Card>
        )}

        {excel.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Exportar a Excel</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {excel.map(i => (
                <Link key={i.href} href={i.href} className="block text-sm text-teal-700 hover:underline">{i.label}</Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
