import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'

// Spec: HU-022 RN-04 — solo compras/admin marcan/desmarcan facturado, a
// diferencia de resolver/anular de HU-021 (que también autorizan al
// coordinador del área) — deliberadamente más restringido, ver nota de
// visión multiempresa en HU-022-v2.md.
const ROLES_FACTURAR = ['compras', 'admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await adminClient()
      .from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
    if (!perfil || !ROLES_FACTURAR.includes(perfil.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id, releaseId } = await params

    const { data: release, error: errorRelease } = await adminClient()
      .from('oca_releases').select('*').eq('id', releaseId).eq('oca_id', id).single()
    if (errorRelease || !release) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    // Spec: CA-06 — desmarcar es facturado:false explícito en el body;
    // cualquier otro body (con numero_factura) es la variante de marcar.
    const esDesmarcar = body?.facturado === false

    if (esDesmarcar) {
      if (!release.facturado) {
        return NextResponse.json({ error: 'Este release no está facturado' }, { status: 409 })
      }
      await adminClient().from('oca_releases').update({
        facturado: false,
        numero_factura: null,
      }).eq('id', releaseId)

      await registrarAuditoria({
        accion: 'desfacturar_release_oca', entidad: 'oca_release', entidad_id: releaseId, referencia: release.numero_release,
      })

      return NextResponse.json({ facturado: false, numero_factura: null })
    }

    // Marcar como facturado
    const numero_factura = (body?.numero_factura ?? '').trim()
    if (!numero_factura) {
      return NextResponse.json({ error: 'El número de factura es requerido' }, { status: 400 })
    }
    // Spec: CA-04 — solo un release aprobado puede facturarse (evita
    // duplicidad de pago sobre algo rechazado/pendiente/anulado)
    if (release.estado !== 'aprobado') {
      return NextResponse.json({ error: 'Solo se puede facturar un release aprobado' }, { status: 409 })
    }

    await adminClient().from('oca_releases').update({
      facturado: true,
      numero_factura,
    }).eq('id', releaseId)

    await registrarAuditoria({
      accion: 'facturar_release_oca', entidad: 'oca_release', entidad_id: releaseId, referencia: release.numero_release,
    })

    return NextResponse.json({ facturado: true, numero_factura })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
