-- HU-028: Ingreso de Productos desde OC con Kardex y Costeo Promedio Ponderado
-- Ver HU-028-v2.md y sdd-design.md para el diseno completo.
--
-- Nucleo del modulo Bodega: motor de costeo (Kardex + promedio ponderado) que
-- HU-029/030/031 reutilizaran. Depende de HU-026 (bodegas) y HU-027
-- (inventario.bodega_id/categoria_id).

-- 1. Cabecera del Documento de Ingreso.
CREATE TABLE IF NOT EXISTS documentos_ingreso (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               TEXT NOT NULL UNIQUE,
  bodega_id            UUID NULL REFERENCES bodegas(id),
  estado               TEXT NOT NULL DEFAULT 'generado'
                         CHECK (estado IN ('generado','en_validacion','cerrado','anulado')),
  registro_compras_id  UUID NULL REFERENCES registro_compras(id),
  creado_por_id        UUID NOT NULL REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrado_por_id        UUID NULL REFERENCES auth.users(id),
  cerrado_en           TIMESTAMPTZ NULL,
  motivo_anulacion     TEXT NULL
);

-- 2. Lineas del Documento de Ingreso.
--    producto_id nullable a proposito (CA-01b): una linea sin producto real
--    vinculado existe (no se pierde trazabilidad de lo comprado) pero bloquea
--    el cierre del documento (CA-05) hasta resolverse.
CREATE TABLE IF NOT EXISTS documentos_ingreso_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_ingreso_id  UUID NOT NULL REFERENCES documentos_ingreso(id),
  producto_id           UUID NULL REFERENCES inventario(id),
  codigo_oc             TEXT NULL,
  descripcion_oc        TEXT NOT NULL,
  cantidad              NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo_unitario        NUMERIC(12,2) NOT NULL DEFAULT 0,
  justificacion         TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Kardex -- tabla de hechos append-only (CA-07/RN-BOD-12: inmutable tras
--    insertarse, ninguna pantalla la edita ni la borra).
CREATE TABLE IF NOT EXISTS kardex_movimientos (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id                UUID NOT NULL REFERENCES inventario(id),
  bodega_id                  UUID NULL REFERENCES bodegas(id),
  direccion                  TEXT NOT NULL CHECK (direccion IN ('entrada','salida')),
  tipo                       TEXT NOT NULL CHECK (tipo IN (
                               'compra','devolucion','field_build','reconteo',
                               'venta','prestamo','gasto'
                             )),
  cantidad                   NUMERIC(10,2) NOT NULL,
  costo_unitario             NUMERIC(12,2) NOT NULL,
  saldo_resultante           NUMERIC(10,2) NOT NULL,
  costo_promedio_resultante  NUMERIC(12,2) NOT NULL,
  documento_ingreso_id       UUID NULL REFERENCES documentos_ingreso(id),
  fecha                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Secuencia anual -- mismo patron que np_secuencia/oc_secuencia/oca_secuencia.
CREATE TABLE IF NOT EXISTS bodega_secuencia_ingreso (
  año           INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION siguiente_numero_ingreso(p_year INTEGER) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO bodega_secuencia_ingreso (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = bodega_secuencia_ingreso.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;

-- 5. Indices.
CREATE INDEX IF NOT EXISTS idx_documentos_ingreso_registro_compras ON documentos_ingreso (registro_compras_id);
CREATE INDEX IF NOT EXISTS idx_documentos_ingreso_estado           ON documentos_ingreso (estado);
CREATE INDEX IF NOT EXISTS idx_documentos_ingreso_items_doc        ON documentos_ingreso_items (documento_ingreso_id);
CREATE INDEX IF NOT EXISTS idx_documentos_ingreso_items_producto   ON documentos_ingreso_items (producto_id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_producto         ON kardex_movimientos (producto_id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_bodega           ON kardex_movimientos (bodega_id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_documento_ingreso ON kardex_movimientos (documento_ingreso_id);
CREATE INDEX IF NOT EXISTS idx_kardex_movimientos_fecha            ON kardex_movimientos (fecha);

-- 6. RLS -- habilitado explicitamente, sin ninguna politica anon/authenticated
--    (mismo patron que HU-018/HU-026 -- todo el acceso via adminClient() en
--    rutas autenticadas; dev:local no auto-habilita RLS como si lo hace el
--    Supabase hospedado, por eso se declara aqui de forma explicita).
ALTER TABLE documentos_ingreso        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_ingreso_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kardex_movimientos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_secuencia_ingreso  ENABLE ROW LEVEL SECURITY;
