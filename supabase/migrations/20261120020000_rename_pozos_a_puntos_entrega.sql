-- Renombra "Pozos" a "Lugar de Entrega" (interno: puntos_entrega /
-- punto_entrega_id) — nombre agnóstico de industria para futuros clientes
-- multiempresa que no sean del sector petrolero. Decisión del usuario
-- (2026-11-20): renombrar el modelo de datos completo, no solo la etiqueta
-- visible. "destino"/"destinos" se descartó por colisionar con
-- `permiteDestino`, ya usado en el mismo módulo de Egresos.
--
-- Migración nueva (en vez de editar las originales de HU-026/HU-030, ya
-- aplicadas) — mismo criterio ya usado en 20261120000000_fix_kardex_orden_historico.sql.

ALTER TABLE pozos RENAME TO puntos_entrega;
ALTER INDEX idx_pozos_cliente_final_id RENAME TO idx_puntos_entrega_cliente_final_id;
ALTER TABLE documentos_egreso RENAME COLUMN pozo_id TO punto_entrega_id;
