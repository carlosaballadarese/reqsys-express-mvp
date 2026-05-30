import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { OCDocument } from '@/lib/oc-pdf'
import React from 'react'
import path from 'path'
import fs from 'fs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params

    const [{ data: oc }, { data: items }, { data: empresa }] = await Promise.all([
      adminClient().from('registro_compras').select('*').eq('id', id).single(),
      adminClient().from('items_oc').select('*').eq('registro_compras_id', id).order('linea'),
      adminClient().from('configuracion_empresa').select('*').eq('id', 1).single(),
    ])

    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (oc.estado_oc !== 'aprobada')
      return NextResponse.json({ error: 'Solo se puede exportar OCs aprobadas' }, { status: 400 })

    // Derivar cargo del creador desde perfiles
    let creadorCargo = 'Compras'
    if (oc.creado_por_id) {
      const { data: perfil } = await adminClient()
        .from('perfiles').select('rol').eq('id', oc.creado_por_id).single()
      if (perfil?.rol === 'asistente_compras') creadorCargo = 'Asistente de Compras'
      else if (perfil?.rol === 'admin')        creadorCargo = 'Administrador'
    }

    // Logo ARLIFT como base64
    const logoPath = path.join(process.cwd(), 'public', 'logo_arlift.png')
    const logoSrc  = fs.existsSync(logoPath)
      ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
      : ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(OCDocument, {
      oc, items: items ?? [], empresa: empresa ?? {}, logoSrc, creadorCargo,
    }) as any
    const buffer = await renderToBuffer(element)

    const nombre = `OC_${oc.numero_oc}_${(oc.proveedor ?? 'proveedor').replace(/[^a-zA-Z0-9\-_.]/g, '-')}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${nombre}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF error:', err)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}
