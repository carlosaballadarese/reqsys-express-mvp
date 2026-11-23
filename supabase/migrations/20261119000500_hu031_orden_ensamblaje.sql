-- HU-031: Orden de Ensamblaje (Field Build)
-- Ver HU-031-v2.md y sdd-design.md para el diseno completo.

CREATE TABLE IF NOT EXISTS ordenes_ensamblaje (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            TEXT NOT NULL UNIQUE,
  bodega_id         UUID NOT NULL REFERENCES bodegas(id),
  estado            TEXT NOT NULL DEFAULT 'generada' CHECK (estado IN ('generada','confirmada')),
  creado_por_id     UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmado_por_id UUID NULL REFERENCES auth.users(id),
  confirmado_en     TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS ordenes_ensamblaje_insumos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_ensamblaje_id  UUID NOT NULL REFERENCES ordenes_ensamblaje(id),
  producto_id          UUID NOT NULL REFERENCES inventario(id),
  cantidad             NUMERIC(10,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordenes_ensamblaje_resultados (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_ensamblaje_id  UUID NOT NULL REFERENCES ordenes_ensamblaje(id),
  producto_id          UUID NOT NULL REFERENCES inventario(id),
  cantidad             NUMERIC(10,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bodega_secuencia_ensamblaje (
  año           INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION siguiente_numero_ensamblaje(p_year INTEGER) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO bodega_secuencia_ensamblaje (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = bodega_secuencia_ensamblaje.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;

-- Spec: HU-031 CA-03 -- kardex_movimientos gana su tercera columna de origen
-- nullable (documento_ingreso_id de HU-028, documento_egreso_id de HU-030).
ALTER TABLE kardex_movimientos
  ADD COLUMN IF NOT EXISTS orden_ensamblaje_id UUID NULL REFERENCES ordenes_ensamblaje(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_ensamblaje_bodega        ON ordenes_ensamblaje (bodega_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_ensamblaje_estado        ON ordenes_ensamblaje (estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_ensamblaje_insumos_orden ON ordenes_ensamblaje_insumos (orden_ensamblaje_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_ensamblaje_result_orden  ON ordenes_ensamblaje_resultados (orden_ensamblaje_id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_ensamblaje    ON kardex_movimientos (orden_ensamblaje_id);

ALTER TABLE ordenes_ensamblaje            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_ensamblaje_insumos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_ensamblaje_resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_secuencia_ensamblaje   ENABLE ROW LEVEL SECURITY;
