-- HU-042: Guia de Remision desde un Documento de Egreso de Bodega
-- Ver HU-042-v2.md y sdd-design.md. Migracion 100% aditiva.

-- Producto: indicador por defecto + unidad de medida (CA-01, CA-21)
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS requiere_guia BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS unidad        TEXT    NOT NULL DEFAULT 'EA';

-- Linea de egreso: override por linea (CA-02) + borrador de traslado (CA-04b, RN-09)
ALTER TABLE documentos_egreso_items ADD COLUMN IF NOT EXISTS requiere_guia BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE documentos_egreso       ADD COLUMN IF NOT EXISTS datos_traslado JSONB NULL;

-- Catalogo de transportistas (CA-11)
CREATE TABLE IF NOT EXISTS transportistas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  identificacion TEXT NOT NULL,
  placa          TEXT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guia de remision (cabecera). Snapshot de destinatario/transportista (RN-07).
CREATE TABLE IF NOT EXISTS guias_remision (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                        INTEGER NOT NULL UNIQUE,
  serie                         TEXT NOT NULL,
  estado                        TEXT NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','anulada')),
  documento_egreso_id           UUID NOT NULL REFERENCES documentos_egreso(id),
  fecha_inicio_traslado         DATE NOT NULL,
  fecha_fin_traslado            DATE NOT NULL,
  punto_partida                 TEXT NOT NULL,
  punto_llegada                 TEXT NOT NULL,
  motivo                        TEXT NOT NULL CHECK (motivo IN ('venta','renta','devolucion','consignacion','otros')),
  motivo_otros                  TEXT NULL,
  numero_referencia             TEXT NULL,
  comentarios                   TEXT NULL,
  cliente_final_id              UUID NULL REFERENCES clientes_finales(id),
  punto_entrega_id              UUID NULL REFERENCES puntos_entrega(id),
  destinatario_nombre           TEXT NOT NULL,
  destinatario_ruc              TEXT NULL,
  transportista_id              UUID NULL REFERENCES transportistas(id),
  transportista_nombre          TEXT NOT NULL,
  transportista_identificacion  TEXT NOT NULL,
  placa                         TEXT NOT NULL,
  despachado_por_id             UUID NOT NULL REFERENCES auth.users(id),
  despachado_por_nombre         TEXT NOT NULL,
  creado_por_id                 UUID NOT NULL REFERENCES auth.users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo_anulacion              TEXT NULL,
  anulada_por_id                UUID NULL REFERENCES auth.users(id),
  anulada_en                    TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS guias_remision_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id         UUID NOT NULL REFERENCES guias_remision(id),
  egreso_item_id  UUID NOT NULL REFERENCES documentos_egreso_items(id),
  producto_id     UUID NOT NULL REFERENCES inventario(id),
  linea           INTEGER NOT NULL,
  codigo          TEXT NOT NULL,
  descripcion     TEXT NOT NULL,
  unidad          TEXT NOT NULL,
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_guias_remision_egreso   ON guias_remision (documento_egreso_id);
CREATE INDEX IF NOT EXISTS idx_guias_remision_estado   ON guias_remision (estado);
CREATE INDEX IF NOT EXISTS idx_guias_items_guia        ON guias_remision_items (guia_id);
CREATE INDEX IF NOT EXISTS idx_guias_items_egreso_item ON guias_remision_items (egreso_item_id);

-- Secuencia unica de guias, sembrada en 1821 (ultima guia emitida en el libro
-- Excel actual) para que la siguiente sea 1822.
CREATE TABLE IF NOT EXISTS guia_secuencia (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ultimo_numero INTEGER NOT NULL
);
INSERT INTO guia_secuencia (id, ultimo_numero) VALUES (1, 1821) ON CONFLICT (id) DO NOTHING;

-- Incremento atomico con tope opcional. Si se excede p_hasta la excepcion
-- revierte el UPDATE: no se consume el numero (CA-22).
CREATE OR REPLACE FUNCTION siguiente_numero_guia(p_hasta INTEGER DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_numero INTEGER;
BEGIN
  UPDATE guia_secuencia SET ultimo_numero = ultimo_numero + 1 WHERE id = 1
  RETURNING ultimo_numero INTO v_numero;
  IF p_hasta IS NOT NULL AND v_numero > p_hasta THEN
    RAISE EXCEPTION 'GUIA_RANGO_AGOTADO';
  END IF;
  RETURN v_numero;
END;
$$;

-- Datos fijos del encabezado (CA-15, RN-08). Todos nullable salvo defaults.
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_serie                      TEXT NOT NULL DEFAULT '001-001';
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_autorizacion_sri           TEXT NULL;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_leyenda_agente_retencion   TEXT NULL;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_obligado_contabilidad      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_documento_categorizado     TEXT NOT NULL DEFAULT 'NO';
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_punto_partida_defecto      TEXT NOT NULL DEFAULT 'BASE ARLIFT';
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_numero_desde               INTEGER NULL;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_numero_hasta               INTEGER NULL;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS guia_vigencia_hasta             DATE NULL;

ALTER TABLE transportistas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guias_remision          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guias_remision_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE guia_secuencia          ENABLE ROW LEVEL SECURITY;
