-- ============================================================
-- REQSYS — Seed de datos de catálogo/referencia para desarrollo local.
-- Se ejecuta automáticamente en `supabase start` y `supabase db reset`.
-- No incluye usuarios (auth.users) — ver scripts/seed-local-dev.mjs,
-- que los crea vía Admin API después de que el stack esté arriba.
-- ============================================================

-- Coordinadores por área (idéntico a supabase-schema.sql, réplica de producción)
INSERT INTO coordinadores_area (area, nombre, email) VALUES
  ('Operaciones - Bombeo Mecánico', 'Coordinador Bombeo', 'coordinador.bombeo@arlift.com'),
  ('Operaciones - Servicio Eléctrico', 'Coordinador Eléctrico', 'coordinador.electrico@arlift.com'),
  ('Operaciones - Niveles', 'Coordinador Niveles', 'coordinador.niveles@arlift.com'),
  ('Compras', 'Coordinador Compras', 'coordinador.compras@arlift.com'),
  ('QHSE', 'Coordinador QHSE', 'coordinador.qhse@arlift.com'),
  ('TTHH', 'Coordinador TTHH', 'coordinador.tthh@arlift.com'),
  ('Finanzas', 'Coordinador Finanzas', 'coordinador.finanzas@arlift.com'),
  ('Gerencia', 'Gerente General', 'gerencia@arlift.com'),
  ('Ventas', 'Coordinador Ventas', 'coordinador.ventas@arlift.com')
ON CONFLICT (area) DO NOTHING;

-- Feriados de referencia (HU-009) — mínimo set para probar cálculo de SLA en días hábiles
INSERT INTO feriados (fecha, descripcion) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-24', 'Batalla de Pichincha'),
  ('2026-08-10', 'Primer Grito de Independencia')
ON CONFLICT DO NOTHING;

-- Acciones de gestión (HU-009) — checklist informativo del comprador
INSERT INTO acciones_gestion (orden, descripcion) VALUES
  (1, 'Asignada'),
  (2, 'Solicitud de ofertas'),
  (3, 'Ofertas recibidas'),
  (4, 'Tabulación'),
  (5, 'Aprobación técnica'),
  (6, 'Adjudicación')
ON CONFLICT DO NOTHING;

-- Secuencias de numeración (año actual del entorno de pruebas)
INSERT INTO np_secuencia (año, ultimo_numero) VALUES (2026, 0) ON CONFLICT (año) DO NOTHING;
INSERT INTO oc_secuencia (año, ultimo_numero) VALUES (2026, 0) ON CONFLICT (año) DO NOTHING;

-- Datos de empresa (singleton, id=1) — bloque FACTURAR A en la OC
INSERT INTO configuracion_empresa (id, razon_social, ruc, direccion, contacto, telefono, email)
VALUES (1, 'ARLIFT ENGINEERING & SERVICES S.A.', '1790000000001', 'Av. de prueba S/N, Quito', 'Contacto de Prueba', '022345678', 'compras@arlift.dev')
ON CONFLICT (id) DO NOTHING;

-- Proveedores de prueba — nombres ficticios, incluye 2 con el mismo giro para
-- probar filtros/consolidación (HU-016) sin depender de datos reales de producción.
INSERT INTO proveedores (nombre, clasificacion, categoria, ciudad, giro_negocio, telefono, email, contacto, activo, ruc, direccion) VALUES
  ('Ferretería Central de Pruebas', 'A', 'Bienes', 'Quito', 'Ferretería industrial', '022000001', 'ventas@ferrepruebas.dev', 'Juan Pérez', true, '1790000001001', 'Av. Ferretera 100'),
  ('Repuestos del Valle (Test)', 'B', 'Bienes', 'Quito', 'Repuestos mecánicos', '022000002', 'ventas@repuestosvalle.dev', 'María López', true, '1790000002001', 'Calle Repuestos 200'),
  ('Servicios Técnicos Demo S.A.', 'A', 'Servicios', 'Guayaquil', 'Mantenimiento técnico', '042000003', 'contacto@serviciosdemo.dev', 'Carlos Ruiz', true, '0990000003001', 'Vía Técnica 300')
ON CONFLICT DO NOTHING;
