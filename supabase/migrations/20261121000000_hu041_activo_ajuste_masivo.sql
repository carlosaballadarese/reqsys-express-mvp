-- Spec: HU-041 — Reemplazo Total del Catálogo de Inventario desde Archivo Maestro
-- Aditivo: no toca ninguna fila existente.

ALTER TABLE inventario ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE documentos_ingreso DROP CONSTRAINT IF EXISTS documentos_ingreso_tipo_movimiento_check;
ALTER TABLE documentos_ingreso ADD CONSTRAINT documentos_ingreso_tipo_movimiento_check
  CHECK (tipo_movimiento IN ('compra','devolucion','reconteo','ajuste_masivo'));

ALTER TABLE documentos_egreso DROP CONSTRAINT IF EXISTS documentos_egreso_tipo_check;
ALTER TABLE documentos_egreso ADD CONSTRAINT documentos_egreso_tipo_check
  CHECK (tipo IN ('venta','gasto','prestamo','reconteo','ajuste_masivo'));

-- Spec: HU-041 — hallazgo real de validación: kardex_movimientos.tipo tiene
-- su PROPIO CHECK independiente (HU-028), distinto de los 2 de arriba —
-- sin esto, cerrarDocumentoIngreso()/cerrarDocumentoEgreso() fallan al
-- insertar el movimiento real con 'ajuste_masivo' (23514, nunca detectado
-- por los tests unitarios porque sus mocks de adminClient().from(...).insert()
-- no aplican ningún CHECK real).
ALTER TABLE kardex_movimientos DROP CONSTRAINT IF EXISTS kardex_movimientos_tipo_check;
ALTER TABLE kardex_movimientos ADD CONSTRAINT kardex_movimientos_tipo_check
  CHECK (tipo IN ('compra','devolucion','field_build','reconteo','venta','prestamo','gasto','ajuste_masivo'));

ALTER TABLE documentos_egreso_items ADD COLUMN IF NOT EXISTS costo_objetivo NUMERIC(12,2) NULL;

-- Spec: RN-03 — sembrado, no seleccionable manualmente en los formularios de creación
-- (mismo criterio ya usado para excluir 'compra' de los selects manuales de HU-029/HU-030).
INSERT INTO tipos_ingreso (codigo, nombre, activo)
  VALUES ('ajuste_masivo', 'Ajuste Masivo (Reemplazo de Inventario)', true)
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO tipos_egreso (codigo, nombre, activo)
  VALUES ('ajuste_masivo', 'Ajuste Masivo (Reemplazo de Inventario)', true)
  ON CONFLICT (codigo) DO NOTHING;
