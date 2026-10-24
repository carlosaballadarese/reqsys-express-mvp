import { adminClient } from '@/lib/supabase/clients'

export type EstadoOca =
  | 'borrador' | 'en_aprobacion' | 'vigente' | 'suspendida'
  | 'agotada' | 'vencida' | 'cerrada'

// Spec: HU-018 CA-11 — estados desde los que se puede cerrar una OCA.
export const ESTADOS_OCA_NO_TERMINALES: EstadoOca[] =
  ['vigente', 'suspendida', 'agotada', 'vencida']

// Spec: HU-018 CA-07 — único estado que permite generar releases (Fase D futura).
export const ESTADOS_OCA_ACTIVA: EstadoOca[] = ['vigente']

// Spec: HU-018 CA-08/CA-09 — único estado que se recalcula en caliente en esta
// HU. vencida/agotada no retroceden solas; una Enmienda (Fase C futura) es la
// única vía de regreso a vigente.
export const ESTADOS_OCA_AUTOGESTIONADOS: EstadoOca[] = ['vigente']

// Spec: HU-019 RN-01 — una OCA cuenta como cobertura viva de una línea de NP
// en cualquier estado salvo `cerrada` (terminal) — mismo rol que excluir
// rechazada/cancelada cumple para "OC viva" (ESTADOS_OC_VIVOS en np-estado.ts).
export const ESTADOS_OCA_VIVAS: EstadoOca[] =
  ['borrador', 'en_aprobacion', 'vigente', 'suspendida', 'agotada', 'vencida']

type OcaResumen = {
  id: string
  estado: string
  fecha_fin: string
  presupuesto_total: number
}

// Spec: HU-021 CA-10 — deja de ser placeholder. Suma monto_total de los
// releases en estado 'aprobado' de esta OCA. 'anulado' queda fuera
// automáticamente con el filtro de estado — no requiere lógica de resta
// aparte (RN-09: anular restituye presupuesto simplemente dejando de contar).
export async function calcularPresupuestoConsumido(ocaId: string): Promise<number> {
  const { data } = await adminClient()
    .from('oca_releases')
    .select('monto_total')
    .eq('oca_id', ocaId)
    .eq('estado', 'aprobado')

  return (data ?? []).reduce((sum: number, r: { monto_total: number }) => sum + Number(r.monto_total), 0)
}

// Spec: HU-018 CA-08, CA-09, RN-08 — deriva el estado destino sin persistir.
// agotada tiene prioridad sobre vencida si ambas condiciones coinciden (RN-08).
async function calcularEstadoDestino(oca: OcaResumen): Promise<EstadoOca> {
  const consumido = await calcularPresupuestoConsumido(oca.id)
  if (consumido >= oca.presupuesto_total) return 'agotada'
  if (new Date(oca.fecha_fin) < new Date()) return 'vencida'
  return oca.estado as EstadoOca
}

// Spec: HU-018 CA-08, CA-09 — recalcula y persiste. No-op si el estado actual
// no está en ESTADOS_OCA_AUTOGESTIONADOS (mismo guard que actualizarEstadoNP).
export async function actualizarEstadoOca(ocaId: string): Promise<void> {
  const { data: oca } = await adminClient()
    .from('oca')
    .select('id, estado, fecha_fin, presupuesto_total')
    .eq('id', ocaId)
    .single()

  if (!oca) return
  if (!ESTADOS_OCA_AUTOGESTIONADOS.includes(oca.estado as EstadoOca)) return

  const destino = await calcularEstadoDestino(oca as OcaResumen)
  if (destino === oca.estado) return

  await adminClient().from('oca').update({ estado: destino }).eq('id', ocaId)

  await adminClient().from('historial_oca').insert({
    oca_id: ocaId,
    estado: destino,
    actor_nombre: 'Sistema',
    actor_email: 'sistema@reqsys',
    notas: `Estado actualizado automáticamente a '${destino}'`,
  })
}
