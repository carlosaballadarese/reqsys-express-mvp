import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/clients'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('configuracion_empresa')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient()
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || !['admin', 'compras'].includes(perfil.rol))
    return NextResponse.json({ error: 'Solo administradores y compras pueden modificar la configuración de empresa' }, { status: 403 })

  try {
    const body = await req.json()
    const { razon_social, ruc, direccion, contacto, telefono, email,
            documento_numero_oc, revision_oc,
            documento_numero_np, revision_np,
            patron_codigo_bodega } = body

    if (!razon_social?.trim())
      return NextResponse.json({ error: 'La razón social es requerida' }, { status: 400 })

    // Spec CA-14: revision_np debe ser entero positivo si se proporciona
    if (revision_np != null && (isNaN(Number(revision_np)) || Number(revision_np) < 1))
      return NextResponse.json({ error: 'La revisión NP debe ser un número entero positivo' }, { status: 400 })

    // Spec: HU-042 CA-15 — datos fijos del encabezado de la guía de remisión.
    const camposGuia: Record<string, unknown> = {}
    const texto = (k: string, def: string | null) => {
      if (body[k] !== undefined) camposGuia[k] = body[k]?.toString().trim() || def
    }
    texto('guia_serie', '001-001')
    texto('guia_autorizacion_sri', null)
    texto('guia_leyenda_agente_retencion', null)
    texto('guia_documento_categorizado', 'NO')
    texto('guia_punto_partida_defecto', 'BASE ARLIFT')
    if (typeof body.guia_obligado_contabilidad === 'boolean') camposGuia.guia_obligado_contabilidad = body.guia_obligado_contabilidad
    for (const k of ['guia_numero_desde', 'guia_numero_hasta'] as const) {
      if (body[k] === undefined) continue
      if (body[k] === null || body[k] === '') { camposGuia[k] = null; continue }
      const n = Number(body[k])
      if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: 'El rango de guías debe ser un entero positivo' }, { status: 400 })
      camposGuia[k] = n
    }
    if (body.guia_vigencia_hasta !== undefined) {
      if (!body.guia_vigencia_hasta) camposGuia.guia_vigencia_hasta = null
      else if (/^\d{4}-\d{2}-\d{2}$/.test(body.guia_vigencia_hasta)) camposGuia.guia_vigencia_hasta = body.guia_vigencia_hasta
      else return NextResponse.json({ error: 'La vigencia debe tener formato AAAA-MM-DD' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('configuracion_empresa')
      .update({
        razon_social:        razon_social.trim(),
        ruc:                 ruc                || null,
        direccion:           direccion           || null,
        contacto:            contacto            || null,
        telefono:            telefono            || null,
        email:               email               || null,
        documento_numero_oc: documento_numero_oc || null,
        revision_oc:         revision_oc != null ? Number(revision_oc) : null,
        documento_numero_np: documento_numero_np || null,
        revision_np:         revision_np != null ? Number(revision_np) : null,
        // Spec: HU-026 CA-10 — patrón sugerido/informativo, sin validación de
        // formato (ya que v1 deja el código de Bodega como texto libre).
        patron_codigo_bodega: patron_codigo_bodega || null,
        // Spec: HU-042 CA-15/CA-22 — solo se tocan si el cliente los envía.
        ...camposGuia,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
