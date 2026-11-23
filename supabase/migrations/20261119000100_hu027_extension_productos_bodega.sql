-- HU-027: Extension del Catalogo de Productos para Gestion de Bodega
-- Ver HU-027-v2.md y sdd-design.md para el diseno completo.
--
-- categoria_id apunta al catalogo GLOBAL de HU-026 (categorias), nunca a `areas`
-- -- el producto nunca persiste un Area propia (Categoria<->Area es N:M, ver
-- HU-026 RN-BOD-13). Nullable hasta que HU-036 complete la migracion del
-- historico real de ARLIFT.

ALTER TABLE inventario
  ADD COLUMN IF NOT EXISTS bodega_id           UUID NULL REFERENCES bodegas(id),
  ADD COLUMN IF NOT EXISTS categoria_id        UUID NULL REFERENCES categorias(id),
  ADD COLUMN IF NOT EXISTS stock_minimo        NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS stock_maximo        NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS ultimo_conteo_fecha DATE NULL;
