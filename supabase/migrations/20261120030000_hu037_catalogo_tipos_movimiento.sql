-- HU-037: Catalogo de Tipos de Movimiento (Ingreso/Egreso)
-- Ver HU-037-v2.md y sdd-design.md para el diseno completo.
--
-- Capa de presentacion/activacion sobre los valores ya existentes de
-- documentos_ingreso.tipo_movimiento / documentos_egreso.tipo -- esas columnas
-- NO cambian de tipo (siguen TEXT + CHECK), y estas tablas nuevas no tienen
-- ninguna FK hacia ellas. Sin DELETE fisico (RN-03, mismo patron de HU-026).

CREATE TABLE IF NOT EXISTS tipos_ingreso (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tipos_egreso (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tipos_ingreso (codigo, nombre) VALUES
  ('compra', 'Compra'),
  ('devolucion', 'Devolucion'),
  ('reconteo', 'Reconteo')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO tipos_egreso (codigo, nombre) VALUES
  ('venta', 'Venta'),
  ('gasto', 'Gasto'),
  ('prestamo', 'Prestamo'),
  ('reconteo', 'Reconteo')
ON CONFLICT (codigo) DO NOTHING;
