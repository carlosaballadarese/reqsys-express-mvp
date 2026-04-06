-- ============================================================
-- REQSYS — Tablas históricas: Inventario y Registro de Compras
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-schema.sql
-- ============================================================

-- Inventario de productos (Control_Inventario.xlsx → PRODUCTOS)
CREATE TABLE IF NOT EXISTS inventario (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT NOT NULL,
  descripcion      TEXT NOT NULL,
  area             TEXT,
  categoria        TEXT,
  saldo_existencias NUMERIC(10,2) DEFAULT 0,
  costo_unitario   NUMERIC(12,2) DEFAULT 0,
  locacion         TEXT,
  codigo_origen    TEXT,
  descripcion_origen TEXT,
  marca            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Registro histórico de compras (REGISTRO_COMPRAS.xlsx → "2025 2026 (2)")
CREATE TABLE IF NOT EXISTS registro_compras (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item                  INTEGER,
  fecha_np              DATE,
  numero_np             TEXT,
  proveedor             TEXT,
  fecha_oc              DATE,
  numero_oc             TEXT,
  descripcion_oc        TEXT,
  area                  TEXT,
  area_funcional        TEXT,
  tipo_servicio_material TEXT,
  cargado_a             TEXT,
  descripcion_final     TEXT,
  centro_costo          TEXT,
  tipo_compra           TEXT,
  numero_factura        TEXT,
  fecha_factura         DATE,
  valor_total           NUMERIC(12,2) DEFAULT 0,
  valor_retenido        NUMERIC(12,2) DEFAULT 0,
  valor_a_pagar         NUMERIC(12,2) DEFAULT 0,
  banco                 TEXT,
  tipo_pago             TEXT,
  mes_pago              TEXT,
  abono                 NUMERIC(12,2) DEFAULT 0,
  saldo                 NUMERIC(12,2) DEFAULT 0,
  dias_credito          INTEGER DEFAULT 0,
  fecha_vencimiento     DATE,
  estado                TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries del dashboard
CREATE INDEX IF NOT EXISTS idx_rc_area        ON registro_compras(area);
CREATE INDEX IF NOT EXISTS idx_rc_proveedor   ON registro_compras(proveedor);
CREATE INDEX IF NOT EXISTS idx_rc_estado      ON registro_compras(estado);
CREATE INDEX IF NOT EXISTS idx_rc_fecha_oc    ON registro_compras(fecha_oc);
CREATE INDEX IF NOT EXISTS idx_rc_mes_pago    ON registro_compras(mes_pago);
CREATE INDEX IF NOT EXISTS idx_inv_area       ON inventario(area);
CREATE INDEX IF NOT EXISTS idx_inv_categoria  ON inventario(categoria);
