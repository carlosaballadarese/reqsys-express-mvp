// HU-009 — Tarea 24: backfill de Estado para NPs creadas antes de este modelo.
//
// Recorre las NPs que quedaron en estado='aprobada' con un comprador ya asignado
// (asignado_a) bajo el modelo previo a HU-009 — donde 'aprobada' no distinguía si
// la NP ya estaba en gestión, con OC generada, etc. — e invoca actualizarEstadoNP()
// sobre cada una para que aterricen en su Estado real.
//
// Ejecución (one-off, manual, contra producción):
//   cd express-mvp
//   node --env-file=.env.local -r tsx/cjs scripts/backfill-estado-np.ts
//
// Requiere las mismas variables que usa la app (.env.local): NEXT_PUBLIC_SUPABASE_URL
// y SUPABASE_SERVICE_ROLE_KEY. Debe ejecutarse DESPUÉS de que el Grupo F (Tareas 18-23)
// esté desplegado, para que el cálculo de OCs vivas sea consistente.

import { adminClient } from '../lib/supabase/clients'
import { actualizarEstadoNP } from '../lib/np-estado'

async function main() {
  const { data: candidatas, error } = await adminClient()
    .from('notas_pedido')
    .select('id, numero, estado')
    .eq('estado', 'aprobada')
    .not('asignado_a', 'is', null)

  if (error) {
    console.error('Error al leer NPs candidatas:', error.message)
    process.exit(1)
  }

  const total = candidatas?.length ?? 0
  console.log(`NPs candidatas (estado='aprobada', asignado_a IS NOT NULL): ${total}`)

  const antesConteo: Record<string, number> = {}
  const despuesConteo: Record<string, number> = {}

  for (const np of candidatas ?? []) {
    antesConteo[np.estado] = (antesConteo[np.estado] ?? 0) + 1

    await actualizarEstadoNP(np.id)

    const { data: actualizada } = await adminClient()
      .from('notas_pedido')
      .select('estado')
      .eq('id', np.id)
      .single()

    const estadoFinal = actualizada?.estado ?? np.estado
    despuesConteo[estadoFinal] = (despuesConteo[estadoFinal] ?? 0) + 1

    console.log(`${np.numero}: ${np.estado} → ${estadoFinal}`)
  }

  console.log('\n── Resumen ──────────────────────────')
  console.log('Antes:',   JSON.stringify(antesConteo, null, 2))
  console.log('Después:', JSON.stringify(despuesConteo, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill falló:', err)
    process.exit(1)
  })
