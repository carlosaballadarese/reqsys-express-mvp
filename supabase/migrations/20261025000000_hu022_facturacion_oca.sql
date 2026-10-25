-- HU-022: Facturacion de Releases de OCA (Fase E del modulo OCA)
-- Ver HU-022-v2.md y sdd-design.md para el diseno completo.
--
-- Sin tabla nueva de "factura" (decision ya tomada en HU-018): solo
-- modalidad_facturacion en la cabecera de la OCA, y facturado/numero_factura
-- por release. Cambiar la modalidad sobre una OCA vigente es un 4to tipo de
-- enmienda (HU-020), elegible solo desde vigente, sin reactivar estado.

-- 1. Modalidad de facturacion de la OCA.
ALTER TABLE oca ADD COLUMN IF NOT EXISTS modalidad_facturacion TEXT NOT NULL
  DEFAULT 'por_release'
  CHECK (modalidad_facturacion IN ('mensual_consolidada', 'por_release'));

-- 2. Facturacion por release.
ALTER TABLE oca_releases ADD COLUMN IF NOT EXISTS facturado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE oca_releases ADD COLUMN IF NOT EXISTS numero_factura TEXT;

-- 3. 4to tipo de enmienda: cambio_modalidad_facturacion.
ALTER TABLE oca_enmiendas DROP CONSTRAINT IF EXISTS oca_enmiendas_tipo_check;
ALTER TABLE oca_enmiendas ADD CONSTRAINT oca_enmiendas_tipo_check CHECK (tipo IN (
  'incremento_presupuesto', 'extension_plazo', 'modificacion_precios',
  'cambio_modalidad_facturacion'
));
ALTER TABLE oca_enmiendas ADD COLUMN IF NOT EXISTS modalidad_facturacion_nueva TEXT
  CHECK (modalidad_facturacion_nueva IN ('mensual_consolidada', 'por_release'));
