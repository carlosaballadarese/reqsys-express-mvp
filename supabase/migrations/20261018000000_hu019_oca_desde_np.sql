-- HU-019: Creacion de OCA desde una Nota de Pedido (Fase B del modulo OCA)
-- Ver HU-019-v2.md y sdd-design.md para el diseno completo.
--
-- Una NP puede repartir sus lineas entre OC y OCA simultaneamente (no son
-- exclusivas). Requiere trazabilidad linea a linea (igual que
-- items_oc.item_np_id, HU-003) y 2 estados nuevos de NP para reflejar
-- cobertura 100% OCA o mixta (OC+OCA).

-- 1. Trazabilidad linea a linea OCA -> NP (mismo rol que items_oc.item_np_id).
ALTER TABLE oca_items ADD COLUMN IF NOT EXISTS item_np_id UUID REFERENCES items_np(id);
CREATE INDEX IF NOT EXISTS idx_oca_items_item_np_id ON oca_items (item_np_id);

-- 2. notas_pedido.estado: +oca_generada (100% OCA), +oca_oc_generada (mixto OC+OCA).
ALTER TABLE notas_pedido DROP CONSTRAINT IF EXISTS notas_pedido_estado_check;
ALTER TABLE notas_pedido ADD CONSTRAINT notas_pedido_estado_check
  CHECK (estado IN (
    'borrador','pendiente','aprobada','rechazada','devuelta',
    'en_gestion','oc_directa','oc_generada','oc_en_aprobacion','oc_aprobada',
    'completada','cancelada','oca_generada','oca_oc_generada'
  ));
