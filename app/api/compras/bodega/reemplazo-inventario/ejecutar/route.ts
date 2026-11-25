import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/clients'
import { registrarAuditoria } from '@/lib/auditoria'
import { ejecutarReemplazo, type FilaClasificada } from '@/lib/bodega-reemplazo-inventario'

// Spec: HU-041 CA-02 — segunda llamada del flujo de 2 pasos: recibe las
// filas ya clasificadas por /analizar (nunca reenvía el archivo) y ejecuta
// de verdad. Mismos roles que /analizar (admin/compras).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await adminClient().from('perfiles').select('rol, nombre, email').eq('id', user.id).single()
  if (!perfil || !['admin', 'compras'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const filas = body.filas as FilaClasificada[] | undefined
    const bodegaId = body.bodegaId as string | undefined
    // Spec: HU-045 CA-04/CA-05 — fecha opcional, solo tiene efecto sobre
    // productos marcados como contados físicamente por el archivo.
    const fechaConteo = typeof body.fechaConteo === 'string' && body.fechaConteo.trim()
      ? body.fechaConteo.trim()
      : undefined
    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'No se recibieron filas para ejecutar' }, { status: 400 })
    }
    // Spec: HU-041 — documentos_egreso.bodega_id es NOT NULL (HU-030 CA-01);
    // se exige una bodega de referencia para los 2 documentos masivos.
    if (!bodegaId) {
      return NextResponse.json({ error: 'Debes elegir una bodega de referencia para el ajuste' }, { status: 400 })
    }

    const resultado = await ejecutarReemplazo(filas, {
      id: user.id,
      nombre: perfil.nombre,
      email: perfil.email,
      rol: perfil.rol,
    }, bodegaId, fechaConteo)

    await registrarAuditoria({
      accion: 'ejecutar_reemplazo_total_inventario',
      entidad: 'inventario',
      referencia: 'Reemplazo Total de Inventario desde Archivo Maestro',
      detalle: { ...resultado, actor_rol: perfil.rol },
    })

    return NextResponse.json(resultado)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al ejecutar el reemplazo'
    return NextResponse.json({ error: mensaje }, { status: 400 })
  }
}
