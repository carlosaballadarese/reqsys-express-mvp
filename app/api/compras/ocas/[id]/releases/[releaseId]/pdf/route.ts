import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { OcaReleaseDocument } from '@/lib/oca-release-pdf'
import React from 'react'

// Spec: HU-021 CA-12 — mismos 7 roles del histórico de releases/detalle de OCA
const ROLES_VER = ['solicitante', 'bodega', 'compras', 'admin', 'gerencia', 'consulta', 'asistente_compras']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil || !ROLES_VER.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id, releaseId } = await params

    const { data: release, error } = await adminClient()
      .from('oca_releases').select('*').eq('id', releaseId).eq('oca_id', id).single()
    if (error || !release) return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 })

    // Spec: CA-06 — el documento solo existe para releases ya aprobados
    if (release.estado !== 'aprobado') {
      return NextResponse.json({ error: 'Solo se puede descargar el documento de un release aprobado' }, { status: 409 })
    }

    const [{ data: items }, { data: oca }, { data: area }, { data: solicitante }, { data: aprobador }] = await Promise.all([
      adminClient().from('oca_release_items').select('*').eq('release_id', releaseId).order('created_at'),
      adminClient().from('oca').select('numero_oca, proveedor_id').eq('id', id).single(),
      adminClient().from('areas').select('nombre').eq('id', release.area_id).single(),
      adminClient().from('perfiles').select('nombre').eq('id', release.solicitante_id).single(),
      release.resuelto_por_id
        ? adminClient().from('perfiles').select('nombre').eq('id', release.resuelto_por_id).single()
        : Promise.resolve({ data: null }),
    ])

    let proveedorNombre = '—'
    if (oca?.proveedor_id) {
      const { data: proveedor } = await adminClient().from('proveedores').select('nombre').eq('id', oca.proveedor_id).single()
      proveedorNombre = proveedor?.nombre ?? '—'
    }

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reqsys-express.vercel.app'
    const logoUrl = `${appUrl}/logo_arlift.png`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(OcaReleaseDocument, {
      release, items: items ?? [], oca: oca ?? {}, proveedorNombre,
      areaNombre: area?.nombre ?? '—', solicitanteNombre: solicitante?.nombre ?? '—',
      aprobadorNombre: aprobador?.nombre ?? '—', logoUrl,
    }) as any

    const buffer = await renderToBuffer(element)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${release.numero_release}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF error:', err)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}
