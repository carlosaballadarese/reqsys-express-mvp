-- HU-017: Cancelación de Notas de Pedido
-- Amplía notas_pedido.estado a 12 valores (+ 'cancelada') y agrega columnas de
-- snapshot para permitir reabrir una NP cancelada en su Estado exacto previo.

ALTER TABLE notas_pedido DROP CONSTRAINT IF EXISTS notas_pedido_estado_check;
ALTER TABLE notas_pedido ADD CONSTRAINT notas_pedido_estado_check
  CHECK (estado IN (
    'borrador','pendiente','aprobada','rechazada','devuelta',
    'en_gestion','oc_directa','oc_generada','oc_en_aprobacion','oc_aprobada',
    'completada','cancelada'
  ));

ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS estado_previo_cancelacion TEXT NULL;
ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS motivo_cancelacion_np     TEXT NULL;
ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS cancelado_por_id          UUID NULL REFERENCES auth.users(id);
ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS cancelado_en              TIMESTAMPTZ NULL;
