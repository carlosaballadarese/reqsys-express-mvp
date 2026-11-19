-- HU-032: Costeo de Importaciones (Landed Cost) en el Ingreso por Compra
-- Ver HU-032-v2.md y sdd-design.md para el diseno completo.

ALTER TABLE documentos_ingreso_items
  ADD COLUMN IF NOT EXISTS es_importacion          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS costo_fob                NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS factor_nacionalizacion    NUMERIC(6,4) NULL;
