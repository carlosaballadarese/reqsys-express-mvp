-- HU-047: Recepcion Parcial Multiple de Ordenes de Compra en Bodega
-- Ver HU-047-v2.md y sdd-design.md. Migracion 100% aditiva.

-- documentos_ingreso_items no tenia ningun enlace real a items_oc (solo el
-- snapshot de texto codigo_oc/descripcion_oc) -- necesario para calcular
-- cobertura de recepcion por linea de OC (CA-01/RN-01).
--
-- ON DELETE SET NULL es defensa en profundidad: confirmado en Fase 1 SDD que
-- PUT /api/compras/ordenes/[id] (el unico punto que hace DELETE+INSERT de
-- items_oc) ya esta bloqueado por un guard preexistente (estado_oc != 'en_proceso'),
-- y el primer Documento de Ingreso solo nace al aprobar (estado posterior, sin
-- transicion de reversa) -- en la practica este ON DELETE nunca deberia dispararse.
ALTER TABLE documentos_ingreso_items
  ADD COLUMN IF NOT EXISTS item_oc_id UUID NULL REFERENCES items_oc(id) ON DELETE SET NULL;
