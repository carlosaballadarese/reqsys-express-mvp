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

type OcaResumen = {
  id: string
  estado: string
  fecha_fin: string
  presupuesto_total: number
}

// Spec: HU-018 CA-09 — placeholder hasta la HU de Releases (Fase D). Siempre
// 0 en esta HU porque no existe ningún mecanismo de consumo todavía.
// TODO(Fase D — Releases): sumar releases aprobados menos anulados de esta OCA.
export async function calcularPresupuestoConsumido(_ocaId: string): Promise<number> {
  return 0
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
