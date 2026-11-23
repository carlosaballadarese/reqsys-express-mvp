-- HU-030: Egreso de Productos (Venta, Gasto, Prestamo y Reconteo)
-- Ver HU-030-v2.md y sdd-design.md para el diseno completo.

CREATE TABLE IF NOT EXISTS documentos_egreso (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                  TEXT NOT NULL UNIQUE,
  bodega_id               UUID NOT NULL REFERENCES bodegas(id),
  tipo                    TEXT NOT NULL CHECK (tipo IN ('venta','gasto','prestamo','reconteo')),
  estado                  TEXT NOT NULL DEFAULT 'generado'
                            CHECK (estado IN ('generado','en_validacion','cerrado')),
  cliente_final_id        UUID NULL REFERENCES clientes_finales(id),
  pozo_id                 UUID NULL REFERENCES pozos(id),
  override_admin          BOOLEAN NOT NULL DEFAULT FALSE,
  justificacion_override  TEXT NULL,
  creado_por_id           UUID NOT NULL REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrado_por_id          UUID NULL REFERENCES auth.users(id),
  cerrado_en              TIMESTAMPTZ NULL
);

-- Spec: CA-02 -- sin columna de costo, nunca editable; el costo queda solo
-- como snapshot en kardex_movimientos, generado al cerrar.
CREATE TABLE IF NOT EXISTS documentos_egreso_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_egreso_id   UUID NOT NULL REFERENCES documentos_egreso(id),
  producto_id           UUID NOT NULL REFERENCES inventario(id),
  cantidad              NUMERIC(10,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bodega_secuencia_egreso (
  año           INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION siguiente_numero_egreso(p_year INTEGER) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO bodega_secuencia_egreso (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = bodega_secuencia_egreso.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;

-- Spec: HU-030 CA-05 -- columna aditiva ya anticipada por HU-029-v2.
ALTER TABLE documentos_ingreso
  ADD COLUMN IF NOT EXISTS egreso_prestamo_id UUID NULL REFERENCES documentos_egreso(id);

-- Spec: HU-030 CA-06 -- kardex_movimientos.documento_ingreso_id (HU-028) gana
-- su hermana de Egreso -- columna de origen nullable, mismo patron ya
-- anticipado en sdd-design.md de HU-028 ("HU-029/030/031 agregaran sus
-- propias columnas de origen nullable").
ALTER TABLE kardex_movimientos
  ADD COLUMN IF NOT EXISTS documento_egreso_id UUID NULL REFERENCES documentos_egreso(id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_documento_egreso ON kardex_movimientos (documento_egreso_id);

CREATE INDEX IF NOT EXISTS idx_documentos_egreso_bodega     ON documentos_egreso (bodega_id);
CREATE INDEX IF NOT EXISTS idx_documentos_egreso_estado     ON documentos_egreso (estado);
CREATE INDEX IF NOT EXISTS idx_documentos_egreso_tipo       ON documentos_egreso (tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_egreso_items_doc  ON documentos_egreso_items (documento_egreso_id);
CREATE INDEX IF NOT EXISTS idx_documentos_ingreso_egreso_prestamo ON documentos_ingreso (egreso_prestamo_id);

ALTER TABLE documentos_egreso        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_egreso_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_secuencia_egreso  ENABLE ROW LEVEL SECURITY;
