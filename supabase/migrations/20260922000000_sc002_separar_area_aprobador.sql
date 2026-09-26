-- SC-002: Separar Área real y Aprobador en Notas de Pedido
-- Ver SC-002-v2.md y sdd-design.md para el diseño completo.
--
-- Separa la identidad del área (catálogo `areas`, nuevo) de la asignación
-- de aprobador (`coordinadores_area`, que pasa de identidad+aprobador a
-- solo aprobador). Las columnas de texto legado (coordinadores_area.area,
-- notas_pedido.area) se mantienen en paralelo — no se eliminan en esta SC.

-- 1. Catálogo de áreas — identidad pura, reutilizable a futuro por el
--    módulo OCA como su "Centro de Costo".
CREATE TABLE IF NOT EXISTS areas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL UNIQUE,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Aprobadores alternativos por área — acotado por área, no por rol.
--    Si un área no tiene filas aquí, el formulario de NP no muestra
--    selector de aprobador (comportamiento idéntico al actual).
--    coordinadores_area ya existe desde el esquema inicial del MVP.
CREATE TABLE IF NOT EXISTS area_aprobadores_alternativos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id        UUID NOT NULL REFERENCES areas(id),
  coordinador_id UUID NOT NULL REFERENCES coordinadores_area(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (area_id, coordinador_id)
);

-- 3. coordinadores_area: deja de ser identidad de área, pasa a ser
--    exclusivamente asignación de aprobador. `activo`: solo coordinadores
--    activos participan en la derivación de aprobador (RN-07); `DELETE`
--    físico queda bloqueado en el código si hay dependencias activas (RN-08).
ALTER TABLE coordinadores_area ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);
ALTER TABLE coordinadores_area ADD COLUMN IF NOT EXISTS activo  BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. perfiles: a qué área pertenece cada usuario (nullable — el vínculo
--    usuario<->área nunca existió antes de esta SC, no hay backfill posible).
--    Asignado por admin/compras desde /compras/accesos (Tarea 13/16).
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);

-- 5. notas_pedido: área real de la NP + aprobador finalmente asignado a
--    esa NP puntual (por defecto o por override). aprobador_asignado_id
--    referencia coordinadores_area, NO perfiles — los coordinadores
--    aprueban por token de email, no siempre tienen cuenta de login.
ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);
ALTER TABLE notas_pedido ADD COLUMN IF NOT EXISTS aprobador_asignado_id UUID REFERENCES coordinadores_area(id);

-- 6. Backfill determinístico — sin interpretación: cada fila conserva
--    exactamente el área que ya tenía registrada como texto.
--    coordinadores_area.area es UNIQUE y es hoy la única fuente del
--    <select> de área en toda la app, así que el mapeo es 1 a 1 sin
--    ambigüedad.
INSERT INTO areas (nombre)
SELECT DISTINCT area FROM coordinadores_area WHERE area IS NOT NULL
ON CONFLICT (nombre) DO NOTHING;

UPDATE coordinadores_area ca
SET area_id = a.id
FROM areas a
WHERE a.nombre = ca.area AND ca.area_id IS NULL;

UPDATE notas_pedido np
SET area_id = a.id
FROM areas a
WHERE a.nombre = np.area AND np.area_id IS NULL;

-- 7. Tras el backfill, todo coordinador existente queda con area_id
--    resuelto (su propio texto de área siempre generó la fila en `areas`
--    en el paso anterior) — se exige NOT NULL hacia adelante para nuevas
--    filas (Tarea 8: POST /api/compras/coordinadores exige area_id).
--    notas_pedido.area_id se deja nullable: un área huérfana en el texto
--    (sin fila correspondiente en coordinadores_area) quedaría sin
--    backfill y requiere revisión manual — ver SC-002-v2.md §10.
ALTER TABLE coordinadores_area ALTER COLUMN area_id SET NOT NULL;

-- 8. Índices para las consultas nuevas (derivación de aprobador, filtro
--    por área en NP y en el Dashboard de OCs vía items_oc -> items_np).
CREATE INDEX IF NOT EXISTS idx_coordinadores_area_area_id       ON coordinadores_area (area_id);
CREATE INDEX IF NOT EXISTS idx_coordinadores_area_activo        ON coordinadores_area (activo);
CREATE INDEX IF NOT EXISTS idx_area_aprob_alt_area_id           ON area_aprobadores_alternativos (area_id);
CREATE INDEX IF NOT EXISTS idx_area_aprob_alt_coordinador_id    ON area_aprobadores_alternativos (coordinador_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_area_id                 ON perfiles (area_id);
CREATE INDEX IF NOT EXISTS idx_notas_pedido_area_id              ON notas_pedido (area_id);
CREATE INDEX IF NOT EXISTS idx_notas_pedido_aprobador_asignado   ON notas_pedido (aprobador_asignado_id);
