--- Coordinadores por área (se pobla manualmente desde el panel de Supabase)
CREATE TABLE coordinadores_area (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notas de Pedido
CREATE TABLE notas_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  solicitante_nombre TEXT NOT NULL,
  solicitante_email TEXT NOT NULL,
  area TEXT NOT NULL,
  prioridad TEXT NOT NULL CHECK (prioridad IN ('excepcional', 'alta', 'media', 'baja')),
  tipo_compra TEXT NOT NULL CHECK (tipo_compra IN ('producto', 'servicio', 'alquiler', 'importacion', 'consumible')),
  centro_costo TEXT NOT NULL CHECK (centro_costo IN ('costo', 'gasto', 'activo', 'inventario')),
  descripcion_general TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo TEXT,
  token_aprobacion UUID DEFAULT gen_random_uuid(),
  total_estimado NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ítems de la NP
CREATE TABLE items_np (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_pedido_id UUID NOT NULL REFERENCES notas_pedido(id) ON DELETE CASCADE,
  linea INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  unidad TEXT NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_np_updated_at
  BEFORE UPDATE ON notas_pedido
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Datos iniciales: coordinadores por área de ARLIFT
INSERT INTO coordinadores_area (area, nombre, email) VALUES
  ('Operaciones - Bombeo Mecánico', 'Coordinador Bombeo', 'coordinador.bombeo@arlift.com'),
  ('Operaciones - Servicio Eléctrico', 'Coordinador Eléctrico', 'coordinador.electrico@arlift.com'),
  ('Operaciones - Niveles', 'Coordinador Niveles', 'coordinador.niveles@arlift.com'),
  ('Compras', 'Coordinador Compras', 'coordinador.compras@arlift.com'),
  ('QHSE', 'Coordinador QHSE', 'coordinador.qhse@arlift.com'),
  ('TTHH', 'Coordinador TTHH', 'coordinador.tthh@arlift.com'),
  ('Finanzas', 'Coordinador Finanzas', 'coordinador.finanzas@arlift.com'),
  ('Gerencia', 'Gerente General', 'gerencia@arlift.com'),
  ('Ventas', 'Coordinador Ventas', 'coordinador.ventas@arlift.com');
