-- HU-046: Correccion Automatica de Costo Cero al Reingresar Stock
-- Ver HU-046-v2.md y sdd-design.md. Migracion 100% aditiva.

-- Ni documentos_ingreso ni documentos_egreso tenian un campo libre para citar
-- por que se genero un documento (motivo_anulacion/justificacion_override ya
-- tienen semantica propia distinta) -- necesario para que la correccion
-- automatica cite el documento real que la disparo (CA-01).
ALTER TABLE documentos_ingreso ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;
ALTER TABLE documentos_egreso  ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;
