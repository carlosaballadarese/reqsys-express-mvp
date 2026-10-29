-- HU-018: Modelo de Datos y Ciclo de Vida de la Orden de Compra Abierta (OCA)
-- Ver HU-018-v2.md y sdd-design.md para el diseño completo.
--
-- Modulo nuevo, no toca ninguna tabla existente salvo referenciarlas por FK
-- de solo lectura (proveedores, areas de SC-002, auth.users, notas_pedido).

-- 1. Cabecera de la OCA.
CREATE TABLE IF NOT EXISTS oca (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_oca             TEXT NOT NULL UNIQUE,
  origen                 TEXT NOT NULL DEFAULT 'independiente'
                           CHECK (origen IN ('independiente','desde_np')),
  np_origen_id           UUID REFERENCES notas_pedido(id),
  proveedor_id           UUID NOT NULL REFERENCES proveedores(id),
  tipo                   TEXT NOT NULL CHECK (tipo IN ('precio_fijo','precio_variable_tope')),
  descripcion            TEXT NOT NULL,
  fecha_inicio           DATE NOT NULL,
  fecha_fin              DATE NOT NULL,
  presupuesto_total      NUMERIC(12,2) NOT NULL,
  referencia_contractual TEXT NOT NULL,
  estado                 TEXT NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN (
                             'borrador','en_aprobacion','vigente','suspendida',
                             'agotada','vencida','cerrada'
                           )),
  motivo_rechazo         TEXT,
  motivo_suspension      TEXT,
  motivo_cierre          TEXT,
  creado_por_id          UUID NOT NULL REFERENCES auth.users(id),
  aprobado_por_id        UUID REFERENCES auth.users(id),
  aprobado_en            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oca_fecha_fin_posterior CHECK (fecha_fin > fecha_inicio),
  CONSTRAINT oca_presupuesto_positivo CHECK (presupuesto_total > 0)
);

-- 2. Lista de precios (items) de la OCA. Sin campo de cantidad (CA-03) —
--    la cantidad la define cada release (fuera de alcance de esta HU).
CREATE TABLE IF NOT EXISTS oca_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oca_id          UUID NOT NULL REFERENCES oca(id),
  codigo          TEXT NOT NULL,
  descripcion     TEXT NOT NULL,
  unidad          TEXT NOT NULL,
  precio_unitario NUMERIC(12,2),
  precio_maximo   NUMERIC(12,2),
  categoria       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Areas habilitadas para consumir de la OCA ("Centro de Costo" = area,
--    ver CA-02 — reutiliza el catalogo `areas` de SC-002 sin modificarlo).
CREATE TABLE IF NOT EXISTS oca_areas_habilitadas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oca_id     UUID NOT NULL REFERENCES oca(id),
  area_id    UUID NOT NULL REFERENCES areas(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (oca_id, area_id)
);

-- 4. Historial de la OCA — mismas columnas reales de `historial_np`
--    (validado en SDD Fase 1 contra el codigo existente), no un esquema propio.
CREATE TABLE IF NOT EXISTS historial_oca (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oca_id       UUID NOT NULL REFERENCES oca(id),
  estado       TEXT NOT NULL,
  actor_email  TEXT,
  actor_nombre TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Secuencia numerica anual — mismo patron que np_secuencia/oc_secuencia
--    (PK = año, no un id autogenerado).
CREATE TABLE IF NOT EXISTS oca_secuencia (
  año          INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

-- 6. Funcion de secuencia — mismo molde que siguiente_numero_np/siguiente_numero_oc.
CREATE OR REPLACE FUNCTION siguiente_numero_oca(p_year INTEGER) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO oca_secuencia (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = oca_secuencia.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;

-- 7. Indices para las consultas de listado/detalle y derivacion de estado.
CREATE INDEX IF NOT EXISTS idx_oca_proveedor_id      ON oca (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oca_estado             ON oca (estado);
CREATE INDEX IF NOT EXISTS idx_oca_creado_por_id       ON oca (creado_por_id);
CREATE INDEX IF NOT EXISTS idx_oca_items_oca_id        ON oca_items (oca_id);
CREATE INDEX IF NOT EXISTS idx_oca_areas_hab_oca_id     ON oca_areas_habilitadas (oca_id);
CREATE INDEX IF NOT EXISTS idx_oca_areas_hab_area_id    ON oca_areas_habilitadas (area_id);
CREATE INDEX IF NOT EXISTS idx_historial_oca_oca_id     ON historial_oca (oca_id);

-- 8. RLS — habilitado explicitamente en las 5 tablas, sin ninguna politica
--    anon/authenticated (ver sdd-design.md, decision de RLS). Produccion
--    (Supabase hospedado) auto-habilita RLS en tablas nuevas via un trigger
--    de evento propio de la plataforma que NO existe en dev:local (Postgres
--    plano via CLI) — por eso se declara aqui de forma explicita, para que
--    dev:local reproduzca el mismo comportamiento que producción y no repita
--    el bug real de RLS encontrado en SC-002 (`areas` sin politica anon).
ALTER TABLE oca                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE oca_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE oca_areas_habilitadas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_oca           ENABLE ROW LEVEL SECURITY;
ALTER TABLE oca_secuencia           ENABLE ROW LEVEL SECURITY;
