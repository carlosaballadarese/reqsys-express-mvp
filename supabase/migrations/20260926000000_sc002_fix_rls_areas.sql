-- SC-002 — fix: la migración 20260922000000 dejó `areas` con RLS habilitado
-- (heredado del comportamiento por defecto de este proyecto para tablas
-- nuevas) pero sin ninguna política — anonClient() (usado por el GET público
-- de Nueva NP y por /compras/accesos) veía 0 filas aunque la tabla tuviera
-- datos reales, ya que solo el service_role (adminClient) ignora RLS.
-- Detectado en producción tras el deploy: el <select> de área aparecía vacío.
--
-- Mismo patrón ya usado para coordinadores_area (anon_read_coordinadores).
CREATE POLICY "anon_read_areas" ON "public"."areas" FOR SELECT TO "anon" USING (true);
