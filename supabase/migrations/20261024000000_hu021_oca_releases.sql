-- HU-021: Generacion y Aprobacion de Releases de OCA (Fase D del modulo OCA)
-- Ver HU-021-v2.md y sdd-design.md para el diseno completo.
--
-- Un release (descargo) es el mecanismo con el que un usuario consume
-- bienes/servicios contra una OCA vigente. Requiere aprobacion del
-- coordinador del area (centro de costo) del release, o de compras/admin,
-- antes de ser efectivo. Al aprobar se descuenta el presupuesto de la OCA;
-- al anular uno ya aprobado, se restituye.

-- 1. Cabecera del release.
CREATE TABLE IF NOT EXISTS oca_releases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_release         TEXT NOT NULL UNIQUE,
  oca_id                 UUID NOT NULL REFERENCES oca(id),
  area_id                UUID NOT NULL REFERENCES areas(id),
  aprobador_asignado_id  UUID REFERENCES coordinadores_area(id),
  solicitante_id         UUID NOT NULL REFERENCES auth.users(id),
  monto_total            NUMERIC(12,2) NOT NULL,
  observaciones          TEXT,
  estado                 TEXT NOT NULL DEFAULT 'pendiente_aprobacion'
                           CHECK (estado IN (
                             'pendiente_aprobacion','aprobado','rechazado','anulado'
                           )),
  motivo_rechazo         TEXT,
  motivo_anulacion       TEXT,
  resuelto_por_id        UUID REFERENCES auth.users(id),
  resuelto_en            TIMESTAMPTZ,
  anulado_por_id         UUID REFERENCES auth.users(id),
  anulado_en             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oca_releases_monto_positivo CHECK (monto_total > 0)
);

-- 2. Lineas del release. Spec: HU-021 hallazgo de Fase 1 — snapshot propio
--    (codigo/descripcion/unidad/precio_unitario), SIN depender de un FK vivo
--    a oca_items. HU-020 (modificacion_precios) y el PUT de OCA en borrador
--    reemplazan oca_items con DELETE+INSERT completo; un FK vivo de uso
--    rompería la base de datos en cuanto coexistiera un release real con una
--    enmienda de precios real sobre la misma OCA vigente. oca_item_id queda
--    solo como referencia informativa, nunca se usa para resolver datos.
CREATE TABLE IF NOT EXISTS oca_release_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id      UUID NOT NULL REFERENCES oca_releases(id),
  oca_item_id     UUID REFERENCES oca_items(id) ON DELETE SET NULL,
  codigo          TEXT NOT NULL,
  descripcion     TEXT NOT NULL,
  unidad          TEXT NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oca_release_items_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT oca_release_items_precio_no_negativo CHECK (precio_unitario >= 0)
);

-- 3. Secuencia de numero_release — PK=oca_id (no año): numero_release es
--    secuencial DENTRO de cada OCA (R001, R002... reinicia por cada OCA
--    nueva), a diferencia de np_secuencia/oc_secuencia/oca_secuencia que
--    son anuales. Mismo molde atomico (ON CONFLICT...RETURNING).
CREATE TABLE IF NOT EXISTS oca_release_secuencia (
  oca_id        UUID PRIMARY KEY REFERENCES oca(id),
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION siguiente_numero_release(p_oca_id UUID) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO oca_release_secuencia (oca_id, ultimo_numero) VALUES (p_oca_id, 1)
  ON CONFLICT (oca_id) DO UPDATE SET ultimo_numero = oca_release_secuencia.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;

-- 4. Indices para las consultas de listado/bandeja/derivacion de presupuesto.
CREATE INDEX IF NOT EXISTS idx_oca_releases_oca_id      ON oca_releases (oca_id);
CREATE INDEX IF NOT EXISTS idx_oca_releases_estado       ON oca_releases (estado);
CREATE INDEX IF NOT EXISTS idx_oca_releases_area_id      ON oca_releases (area_id);
CREATE INDEX IF NOT EXISTS idx_oca_releases_aprobador     ON oca_releases (aprobador_asignado_id);
CREATE INDEX IF NOT EXISTS idx_oca_release_items_release ON oca_release_items (release_id);

-- RLS — mismo criterio que el resto de tablas de OCA (sin politicas, todo
-- el acceso es via adminClient() en rutas autenticadas).
ALTER TABLE oca_releases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE oca_release_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE oca_release_secuencia  ENABLE ROW LEVEL SECURITY;
