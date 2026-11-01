-- SC-003 CA-06: retirar las políticas RLS permisivas (USING(true)/WITH CHECK(true))
-- otorgadas al rol `anon` sobre notas_pedido/items_np/registro_compras/
-- coordinadores_area/inventario.
--
-- Hallazgo confirmado con evidencia real el 2026-10-31 (ver SC-003-v2.md §2.1):
-- un GET directo a PostgREST con la clave anon pública, sin sesión ni token,
-- devolvía HTTP 200 con filas reales de notas_pedido. El token de las rutas
-- públicas (aprobar/editar/devolver) siempre fue un chequeo de código de
-- aplicación, nunca una barrera a nivel de base de datos -- la política RLS,
-- tal como estaba, no filtraba por token en absoluto.
--
-- Prerrequisito de esta migración (ya aplicado en el mismo commit, código
-- de express-mvp): las 3 rutas públicas por token (aprobar/[token],
-- editar/[token], devolver/[token]) y los demás 5 consumidores internos que
-- dependían de estas políticas (lib/np-notificacion.ts, nps/[id]/route.ts,
-- nps/route.ts, nps/[id]/cancelar/route.ts, inventario/next-codigo/route.ts)
-- ya migraron de anonClient() a adminClient() -- el acceso a estas 5 tablas
-- pasa a ser exclusivamente server-side vía service_role, sin ningún
-- consumidor legítimo restante vía el rol anon. Confirmado por grep sobre
-- todo el repo antes de escribir esta migración.
--
-- No ejecutar en producción sin confirmación explícita del usuario (ver
-- SC-003-v2.md §9 — toda escritura en producción requiere aprobación directa).

DROP POLICY IF EXISTS "anon_insert_inventario"     ON "public"."inventario";
DROP POLICY IF EXISTS "anon_read_inventario"       ON "public"."inventario";
DROP POLICY IF EXISTS "anon_insert_items_np"       ON "public"."items_np";
DROP POLICY IF EXISTS "anon_read_items_np"         ON "public"."items_np";
DROP POLICY IF EXISTS "anon_insert_notas_pedido"   ON "public"."notas_pedido";
DROP POLICY IF EXISTS "anon_read_notas_pedido"     ON "public"."notas_pedido";
DROP POLICY IF EXISTS "anon_update_notas_pedido"   ON "public"."notas_pedido";
DROP POLICY IF EXISTS "anon_read_coordinadores"    ON "public"."coordinadores_area";
DROP POLICY IF EXISTS "anon_read_registro_compras" ON "public"."registro_compras";

-- Nota: "areas" mantiene su política "anon_read_areas" (SC-002) -- es un
-- catálogo no sensible (solo nombre de área, sin mutación permitida) y no
-- forma parte de este hallazgo. RLS de las 5 tablas arriba queda en
-- deny-all para anon tras este DROP (ya estaba ENABLE ROW LEVEL SECURITY,
-- sin política = sin acceso), igual que el resto de tablas del esquema
-- (historial_np, items_oc, proveedores, etc.) que nunca tuvieron una
-- política anon en primer lugar.
