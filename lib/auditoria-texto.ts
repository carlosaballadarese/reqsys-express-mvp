// Spec: SC-008-v4.md CA-02 — "Actividad reciente" en Inicio. Fuente de datos:
// GET /api/compras/auditoria (ya existente), consistente con RN-03 (sin
// endpoint de agregación nuevo). No todo evento de negocio queda en
// `auditoria` (p.ej. aprobar/rechazar/devolver NP vía portal no registra
// auditoría, solo historial_np por NP) — esta vista refleja honestamente
// lo que el log de auditoría ya captura, sin inventar eventos nuevos.

export type AuditoriaRow = {
  id: string
  created_at: string
  usuario_nombre: string | null
  accion: string
  entidad: string | null
  referencia: string | null
}

// Las referencias de OC/NP/OCA/release ya son autodescriptivas (numero_oc,
// numero_np, numero_oca, numero_release siguen el formato "TIPO-AÑO-NNNN"),
// así que las plantillas no repiten el prefijo de tipo delante de {ref}.
const VERBOS: Record<string, string> = {
  crear_oc: '{ref} creada',
  editar_oc: '{ref} editada',
  cambiar_estado_oc: '{ref} cambió de estado',
  cancelar_oc: '{ref} cancelada',
  consolidar_np_a_oc: '{ref} generada (consolidada de varias NPs)',
  convertir_np_a_oc: '{ref} generada',
  enviar_aprobacion_oc: '{ref} enviada a aprobación',
  aprobar_oc: '{ref} aprobada',
  rechazar_oc: '{ref} rechazada',

  reenviar_np: '{ref} reenviada a aprobación',
  enviar_np_borrador: '{ref} enviada desde borrador',
  reabrir_np: '{ref} reabierta',
  reclasificar_prioridad_np: '{ref} reclasificada de prioridad',

  crear_oca: '{ref} creada',
  editar_oca: '{ref} editada',
  enviar_aprobacion_oca: '{ref} enviada a aprobación',
  aprobar_oca: '{ref} aprobada',
  rechazar_oca: '{ref} rechazada',
  suspender_oca: '{ref} suspendida',
  reactivar_oca: '{ref} reactivada',
  cerrar_oca: '{ref} cerrada',

  solicitar_enmienda_oca: 'Enmienda solicitada para {ref}',
  aprobar_enmienda_oca: 'Enmienda aprobada para {ref}',
  rechazar_enmienda_oca: 'Enmienda rechazada para {ref}',

  generar_release_oca: 'Release {ref} generado',
  aprobar_release_oca: 'Release {ref} aprobado',
  rechazar_release_oca: 'Release {ref} rechazado',
  anular_release_oca: 'Release {ref} anulado',
  facturar_release_oca: 'Release {ref} facturado',
  desfacturar_release_oca: 'Release {ref} desfacturado',

  crear_proveedor: 'Proveedor {ref} creado',
  editar_proveedor: 'Proveedor {ref} editado',
  crear_item_inventario: 'Ítem de inventario {ref} creado',
  editar_item_inventario: 'Ítem de inventario {ref} editado',
  crear_usuario: 'Usuario {ref} creado',
  editar_usuario: 'Usuario {ref} editado',
  eliminar_usuario: 'Usuario {ref} eliminado',
  cambiar_email_usuario: 'Email de {ref} actualizado',
  reset_password: 'Contraseña restablecida para {ref}',
  crear_feriado: 'Feriado {ref} creado',
  editar_feriado: 'Feriado {ref} editado',
  eliminar_feriado: 'Feriado {ref} eliminado',
  crear_accion: 'Acción de gestión {ref} creada',
  editar_accion: 'Acción de gestión {ref} editada',
  eliminar_accion: 'Acción de gestión {ref} eliminada',
}

// Algunos registros de auditoría (ej. enviar_aprobacion_oca) solo guardan
// entidad_id (UUID, no mostrable) y omiten `referencia` — se degrada a una
// etiqueta genérica de la entidad en vez de mostrar el valor crudo de BD.
const ENTIDAD_LABEL: Record<string, string> = {
  oca: 'OCA',
  nota_pedido: 'NP',
  registro_compras: 'OC',
  oca_release: 'Release',
  oca_enmienda: 'Enmienda',
  proveedor: 'Proveedor',
  item_inventario: 'Ítem de inventario',
}

export function describirAuditoria(row: AuditoriaRow): string {
  const ref = row.referencia ?? (row.entidad ? (ENTIDAD_LABEL[row.entidad] ?? row.entidad) : 'registro')
  const plantilla = VERBOS[row.accion]
  const base = plantilla ? plantilla.replace('{ref}', ref) : `${ref} — ${row.accion.replace(/_/g, ' ')}`
  return row.usuario_nombre ? `${base} · ${row.usuario_nombre}` : base
}

export function tiempoRelativo(fechaISO: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(fechaISO).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} d`
}
