import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { adminClient } from '@/lib/supabase/clients'
import { verificarAutorizacionGuia, formatNumeroGuia } from '@/lib/bodega-guia'
import { GuiaRemisionDocument } from '@/lib/guia-remision-pdf'

// Spec: HU-042 CA-14/CA-20 — PDF de la guía (también para guías anuladas, marcadas como tales).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verificarAutorizacionGuia()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: auth.status })

  try {
    const { id } = await params
    const [{ data: guia }, { data: items }, { data: empresa }] = await Promise.all([
      adminClient().from('guias_remision').select('*').eq('id', id).single(),
      adminClient().from('guias_remision_items').select('linea, codigo, descripcion, unidad, cantidad').eq('guia_id', id).order('linea'),
      adminClient().from('configuracion_empresa').select('*').eq('id', 1).single(),
    ])
    if (!guia) return NextResponse.json({ error: 'Guía no encontrada' }, { status: 404 })

    // Logo por URL pública (Vercel no incluye public/ en el bundle serverless), igual que la OC.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reqsys-express.vercel.app'
    const element = React.createElement(GuiaRemisionDocument, {
      guia, items: (items ?? []).map((i) => ({ ...i, cantidad: Number(i.cantidad) })),
      empresa: empresa ?? {}, logoUrl: `${appUrl}/logo_arlift.png`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

    const buffer = await renderToBuffer(element)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(new Blob([buffer as any]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="GR_${formatNumeroGuia(guia.numero)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF guía error:', err)
    return NextResponse.json({ error: 'Error al generar PDF' }, { status: 500 })
  }
}
