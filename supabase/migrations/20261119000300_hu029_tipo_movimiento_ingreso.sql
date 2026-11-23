-- HU-029: Ingreso de Productos sin OC (Devolucion y Reconteo)
-- Ver HU-029-v2.md y sdd-design.md para el diseno completo.

ALTER TABLE documentos_ingreso
  ADD COLUMN IF NOT EXISTS tipo_movimiento TEXT NOT NULL DEFAULT 'compra'
    CHECK (tipo_movimiento IN ('compra','devolucion','reconteo'));
