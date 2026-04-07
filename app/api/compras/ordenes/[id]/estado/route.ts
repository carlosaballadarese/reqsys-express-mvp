import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { registrarAuditoria } from '@/lib/auditoria'

const ESTADOS_VALIDOS = ['en_proceso', 'en_aprobacion_gerencia', 'en_aprobacion_compras', 'rechazada', 'aprobada']

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }     = await params
    const { estado } = await req.json()

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
    }

    // Leer OC actual
    const { data: ocActual } = await supabaseAdmin
      .from('registro_compras')
      .select('numero_oc, estado_oc')
      .eq('id', id)
      .single()

    // ── Validación de inventario solo al aprobar ──────────────────────────────
    if (estado === 'aprobada') {
      // Obtener todos los ítems de la OC que tienen código de inventario
      const { data: itemsOC, error: errorItems } = await supabaseAdmin
        .from('items_oc')
        .select('codigo, descripcion, cantidad')
        .eq('registro_compras_id', id)
        .not('codigo', 'is', null)

      if (errorItems) {
        return NextResponse.json({ error: 'Error al leer ítems de la OC' }, { status: 500 })
      }

      const itemsConCodigo = (itemsOC ?? []).filter(i => i.codigo?.trim())

      if (itemsConCodigo.length > 0) {
        // Buscar cada ítem en inventario
        const codigos = itemsConCodigo.map(i => i.codigo)
        const { data: stockInventario, error: errorInv } = await supabaseAdmin
          .from('inventario')
          .select('codigo, descripcion, saldo_existencias')
          .in('codigo', codigos)

        if (errorInv) {
          return NextResponse.json({ error: 'Error al consultar inventario' }, { status: 500 })
        }

        const stockMap = new Map(
          (stockInventario ?? []).map(inv => [inv.codigo, inv])
        )

        const errores: string[] = []

        for (const item of itemsConCodigo) {
          const invItem = stockMap.get(item.codigo)

          if (!invItem) {
            errores.push(`"${item.descripcion}" (${item.codigo}) no existe en inventario`)
            continue
          }

          if (Number(invItem.saldo_existencias) < Number(item.cantidad)) {
            errores.push(
              `"${item.descripcion}" (${item.codigo}): stock disponible ${Number(invItem.saldo_existencias).toFixed(2)}, requerido ${Number(item.cantidad).toFixed(2)}`
            )
          }
        }

        if (errores.length > 0) {
          return NextResponse.json(
            {
              error: 'No se puede aprobar la OC. Problemas de inventario:',
              detalle: errores,
            },
            { status: 422 }
          )
        }

        // ── Todo OK: descontar inventario ─────────────────────────────────────
        for (const item of itemsConCodigo) {
          const invItem = stockMap.get(item.codigo)!
          const nuevoSaldo = Number(invItem.saldo_existencias) - Number(item.cantidad)

          const { error: errorUpdate } = await supabaseAdmin
            .from('inventario')
            .update({ saldo_existencias: nuevoSaldo })
            .eq('codigo', item.codigo)

          if (errorUpdate) {
            return NextResponse.json(
              { error: `Error al actualizar stock de "${item.descripcion}" (${item.codigo})` },
              { status: 500 }
            )
          }
        }
      }
    }
    // ── Fin validación ────────────────────────────────────────────────────────

    const { error } = await supabaseAdmin
      .from('registro_compras')
      .update({ estado_oc: estado })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await registrarAuditoria({
      accion:     'cambiar_estado_oc',
      entidad:    'orden_compra',
      entidad_id: id,
      referencia: ocActual?.numero_oc ?? id,
      detalle:    { estado_anterior: ocActual?.estado_oc, estado_nuevo: estado },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
