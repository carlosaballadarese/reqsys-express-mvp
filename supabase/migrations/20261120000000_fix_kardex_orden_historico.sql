-- Correccion post-cierre de HU-036: desempate real para movimientos de
-- Kardex historicos con la misma fecha (el Excel original solo capturaba
-- fecha, nunca hora real -- ver documents/requirements/
-- HU-036-migracion-datos-historicos-bodega/sdd-validation.md, seccion
-- "Correccion post-cierre").
ALTER TABLE kardex_movimientos ADD COLUMN IF NOT EXISTS secuencia_historica INTEGER NULL;

COMMENT ON COLUMN kardex_movimientos.secuencia_historica IS
  'Orden explicito asignado por la migracion historica (HU-036) para '
  'desempatar movimientos con la misma fecha, siguiendo el orden real del '
  'replay cronologico (fecha, luego orden de fila del Excel). NULL para '
  'movimientos generados en vivo por el sistema (HU-028/030/031), donde '
  'fecha + created_at ya alcanzan para desempatar porque cada documento se '
  'cierra en un instante real distinto.';
