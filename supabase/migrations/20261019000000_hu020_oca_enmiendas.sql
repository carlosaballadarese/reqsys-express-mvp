-- HU-020: Enmiendas de OCA (Fase C del modulo OCA)
-- Ver HU-020-v2.md y sdd-design.md para el diseno completo.
--
-- 3 tipos de enmienda sobre una OCA ya vigente: incremento de
-- presupuesto, extension de plazo, modificacion de lista de precios.
-- Requieren aprobacion de Gerencia. Al aprobar, pueden reactivar una
-- OCA agotada/vencida -> vigente (transicion nueva, no producida por
-- ningun otro flujo del sistema).

CREATE TABLE IF NOT EXISTS oca_enmiendas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oca_id                 UUID NOT NULL REFERENCES oca(id),
  tipo                   TEXT NOT NULL CHECK (tipo IN (
                           'incremento_presupuesto','extension_plazo','modificacion_precios'
                         )),
  estado                 TEXT NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente','aprobada','rechazada')),
  justificacion          TEXT NOT NULL,
  referencia_contractual TEXT NOT NULL,
  monto_adicional        NUMERIC(12,2),
  fecha_fin_nueva        DATE,
  items_nuevos           JSONB,
  solicitado_por_id      UUID NOT NULL REFERENCES auth.users(id),
  solicitado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprobado_por_id        UUID REFERENCES auth.users(id),
  aprobado_en            TIMESTAMPTZ,
  motivo_rechazo         TEXT
);

CREATE INDEX IF NOT EXISTS idx_oca_enmiendas_oca_id ON oca_enmiendas (oca_id);
CREATE INDEX IF NOT EXISTS idx_oca_enmiendas_estado ON oca_enmiendas (estado);

-- RLS — mismo criterio que las tablas de HU-018 (sin politicas, todo
-- el acceso es via adminClient() en rutas autenticadas).
ALTER TABLE oca_enmiendas ENABLE ROW LEVEL SECURITY;
