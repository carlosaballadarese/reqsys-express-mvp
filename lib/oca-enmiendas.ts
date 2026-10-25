import { validarItemsSegunTipo, MODALIDADES_FACTURACION, type OcaItemInput, type ModalidadFacturacion } from '@/lib/oca-validaciones'

export type TipoEnmienda =
  | 'incremento_presupuesto'
  | 'extension_plazo'
  | 'modificacion_precios'
  | 'cambio_modalidad_facturacion'

export const TIPOS_ENMIENDA: TipoEnmienda[] = [
  'incremento_presupuesto',
  'extension_plazo',
  'modificacion_precios',
  'cambio_modalidad_facturacion',
]

// Spec: HU-020 RN-04 — incremento de presupuesto permitido desde vigente/agotada
const ESTADOS_PARA_INCREMENTO: string[] = ['vigente', 'agotada']
// Spec: HU-020 RN-05 — extensión de plazo permitida desde vigente/vencida
const ESTADOS_PARA_EXTENSION: string[] = ['vigente', 'vencida']
// Spec: HU-020 RN-06 — modificación de lista de precios solo desde vigente
const ESTADOS_PARA_MODIFICACION: string[] = ['vigente']
// Spec: HU-022 RN-03 — cambio de modalidad de facturación solo desde vigente
const ESTADOS_PARA_CAMBIO_MODALIDAD: string[] = ['vigente']

type OcaResumen = {
  estado: string
  fecha_fin: string
  presupuesto_total: number
  tipo: string
}

type BodyEnmienda = {
  tipo?: string
  justificacion?: string
  referencia_contractual?: string
  monto_adicional?: number
  fecha_fin_nueva?: string
  items?: OcaItemInput[]
  modalidad_facturacion_nueva?: string
}

// Spec: HU-020 RN-03/04/05/06 + HU-022 RN-03 — valida según tipo contra el
// estado actual de la OCA. Retorna el mensaje de error, o null si la
// solicitud es válida. 4 ramas explícitas (sin "else final" implícito —
// con 4 tipos, un tipo inválido ya fue descartado arriba, así que cada
// rama abajo solo entra con su propio tipo confirmado).
export function validarEnmienda(body: BodyEnmienda, oca: OcaResumen): string | null {
  if (!TIPOS_ENMIENDA.includes(body.tipo as TipoEnmienda)) {
    return 'Tipo de enmienda inválido'
  }
  // Spec RN-03 — obligatorias sin importar el tipo
  if (!body.justificacion?.trim()) return 'La justificación es requerida'
  if (!body.referencia_contractual?.trim()) return 'La referencia contractual es requerida'

  if (body.tipo === 'incremento_presupuesto') {
    if (!ESTADOS_PARA_INCREMENTO.includes(oca.estado)) {
      return 'Solo se puede incrementar el presupuesto desde vigente o agotada'
    }
    if (!body.monto_adicional || body.monto_adicional <= 0) {
      return 'El monto adicional debe ser un valor positivo'
    }
    return null
  }

  if (body.tipo === 'extension_plazo') {
    if (!ESTADOS_PARA_EXTENSION.includes(oca.estado)) {
      return 'Solo se puede extender el plazo desde vigente o vencida'
    }
    if (!body.fecha_fin_nueva || new Date(body.fecha_fin_nueva) <= new Date(oca.fecha_fin)) {
      return 'La nueva fecha de fin debe ser posterior a la fecha de fin actual'
    }
    return null
  }

  if (body.tipo === 'modificacion_precios') {
    if (!ESTADOS_PARA_MODIFICACION.includes(oca.estado)) {
      return 'Solo se puede modificar la lista de precios desde vigente'
    }
    if (!body.items || body.items.length === 0) {
      return 'Debe incluir al menos un ítem'
    }
    return validarItemsSegunTipo(oca.tipo, body.items)
  }

  // cambio_modalidad_facturacion
  if (!ESTADOS_PARA_CAMBIO_MODALIDAD.includes(oca.estado)) {
    return 'Solo se puede cambiar la modalidad de facturación desde vigente'
  }
  if (!MODALIDADES_FACTURACION.includes(body.modalidad_facturacion_nueva as ModalidadFacturacion)) {
    return 'La modalidad de facturación nueva es inválida'
  }
  return null
}
