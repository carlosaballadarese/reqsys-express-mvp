-- HU-026: Catalogos Base de Bodega (Bodegas, Categorias y Clientes Finales/Pozos)
-- Ver HU-026-v2.md y sdd-design.md para el diseno completo.
--
-- Categoria es un catalogo GLOBAL (nombre unico), nunca 1:N con Area -- evidencia
-- real del Excel de ARLIFT: "Miscelaneos" (Mecanico+Electrico), "Sensores"
-- (Mecanico+Niveles), "Cables" (Electrico+Niveles) se repiten entre disciplinas.
-- La relacion real es N:M via area_categoria_bodega.
--
-- `areas` (SC-002, ya existente) se reutiliza como catalogo de Area para Bodega
-- en vez de crear una tabla nueva "areas_tecnicas" -- decision explicita del
-- usuario para no mantener la misma informacion organizacional en 2 lugares.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS habilitada_para_bodega BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE configuracion_empresa
  ADD COLUMN IF NOT EXISTS patron_codigo_bodega TEXT NULL;

CREATE TABLE IF NOT EXISTS bodegas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL UNIQUE,
  referencia  TEXT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS area_categoria_bodega (
  area_id      UUID NOT NULL REFERENCES areas(id),
  categoria_id UUID NOT NULL REFERENCES categorias(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, categoria_id)
);

CREATE TABLE IF NOT EXISTS clientes_finales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  ruc         TEXT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spec: pozos.nombre sin UNIQUE a proposito -- dos clientes distintos podrian
-- razonablemente tener un pozo con el mismo nombre (sdd-design.md, "Manejo de
-- duplicados").
CREATE TABLE IF NOT EXISTS pozos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT NOT NULL,
  cliente_final_id  UUID NULL REFERENCES clientes_finales(id),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pozos_cliente_final_id ON pozos (cliente_final_id);
CREATE INDEX IF NOT EXISTS idx_area_categoria_bodega_categoria_id ON area_categoria_bodega (categoria_id);

-- RLS -- mismo criterio que las tablas fundacionales de HU-018 (sin politicas,
-- todo el acceso es via adminClient() en rutas autenticadas; no hay ningun
-- flujo publico/por token que toque Bodega).
ALTER TABLE bodegas ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_categoria_bodega ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_finales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pozos ENABLE ROW LEVEL SECURITY;
