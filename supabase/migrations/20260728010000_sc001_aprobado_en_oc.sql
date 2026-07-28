-- SC-001: Nuevo formato oficial de exportación PDF/Excel de NP y OC
-- Fecha real de aprobación de la OC, para el bloque "Aprobación de Compra"
-- del documento (Nombre/Área/Rol/Fecha/Firma). Nullable: OCs aprobadas antes
-- de este cambio quedan con aprobado_en = NULL (ver SC-001-v3.md §3.3).
ALTER TABLE registro_compras ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ NULL;
