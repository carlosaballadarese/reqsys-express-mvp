


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_dashboard_data"() RETURNS json
    LANGUAGE "sql" SECURITY DEFINER
    AS $_$
  SELECT json_build_object(
    'compras', json_build_object(
      'kpis', (
        SELECT json_build_object(
          'totalGasto',    COALESCE(SUM(valor_total), 0),
          'totalOCs',      COUNT(*),
          'cerradas',      COUNT(*) FILTER (WHERE UPPER(estado) = 'CERRADO'),
          'abiertas',      COUNT(*) FILTER (WHERE UPPER(estado) != 'CERRADO'),
          'pctCerrado',    ROUND(COUNT(*) FILTER (WHERE UPPER(estado) = 'CERRADO') * 100.0 / NULLIF(COUNT(*), 0)),
          'totalPorPagar', COALESCE(SUM(saldo), 0)
        ) FROM registro_compras
      ),
      'porArea', (
        SELECT json_agg(r ORDER BY r.total DESC)
        FROM (
          SELECT area, ROUND(SUM(valor_total)::numeric, 2) AS total
          FROM registro_compras WHERE area IS NOT NULL
          GROUP BY area ORDER BY total DESC LIMIT 10
        ) r
      ),
      'topProveedores', (
        SELECT json_agg(r ORDER BY r.total DESC)
        FROM (
          SELECT proveedor, ROUND(SUM(valor_total)::numeric, 2) AS total, COUNT(*) AS ocs
          FROM registro_compras WHERE proveedor IS NOT NULL
          GROUP BY proveedor ORDER BY total DESC LIMIT 10
        ) r
      ),
      'porMes', (
        SELECT json_agg(json_build_object('mes', mes, 'total', total) ORDER BY orden)
        FROM (
          SELECT mes, ROUND(SUM(valor_total)::numeric, 2) AS total, MIN(orden) AS orden
          FROM (
            SELECT
              CASE UPPER(TRIM(regexp_replace(mes_pago, '\s*[-/,].*$', '')))
                WHEN 'ENERO'      THEN 'ENERO'
                WHEN 'FEBRERO'    THEN 'FEBRERO'
                WHEN 'FBRERO'     THEN 'FEBRERO'
                WHEN 'FEBERO'     THEN 'FEBRERO'
                WHEN 'MARZO'      THEN 'MARZO'
                WHEN 'ABRIL'      THEN 'ABRIL'
                WHEN 'MAYO'       THEN 'MAYO'
                WHEN 'JUNIO'      THEN 'JUNIO'
                WHEN 'JULIO'      THEN 'JULIO'
                WHEN 'AGOSTO'     THEN 'AGOSTO'
                WHEN 'SEPTIEMBRE' THEN 'SEPTIEMBRE'
                WHEN 'OCTUBRE'    THEN 'OCTUBRE'
                WHEN 'NOVIEMBRE'  THEN 'NOVIEMBRE'
                WHEN 'NOVIEBRE'   THEN 'NOVIEMBRE'
                WHEN 'DICIEMBRE'  THEN 'DICIEMBRE'
                WHEN 'DICIEEMBRE' THEN 'DICIEMBRE'
                ELSE NULL
              END AS mes,
              CASE UPPER(TRIM(regexp_replace(mes_pago, '\s*[-/,].*$', '')))
                WHEN 'ENERO'      THEN 1
                WHEN 'FEBRERO'    THEN 2  WHEN 'FBRERO' THEN 2  WHEN 'FEBERO' THEN 2
                WHEN 'MARZO'      THEN 3
                WHEN 'ABRIL'      THEN 4
                WHEN 'MAYO'       THEN 5
                WHEN 'JUNIO'      THEN 6
                WHEN 'JULIO'      THEN 7
                WHEN 'AGOSTO'     THEN 8
                WHEN 'SEPTIEMBRE' THEN 9
                WHEN 'OCTUBRE'    THEN 10
                WHEN 'NOVIEMBRE'  THEN 11  WHEN 'NOVIEBRE' THEN 11
                WHEN 'DICIEMBRE'  THEN 12  WHEN 'DICIEEMBRE' THEN 12
                ELSE 99
              END AS orden,
              valor_total
            FROM registro_compras
            WHERE mes_pago IS NOT NULL AND valor_total IS NOT NULL
          ) sub
          WHERE mes IS NOT NULL
          GROUP BY mes
        ) agg
      ),
      'porTipo', (
        SELECT json_agg(r ORDER BY r.total DESC)
        FROM (
          SELECT tipo_servicio_material AS tipo, ROUND(SUM(valor_total)::numeric, 2) AS total
          FROM registro_compras WHERE tipo_servicio_material IS NOT NULL
          GROUP BY tipo_servicio_material ORDER BY total DESC LIMIT 10
        ) r
      )
    ),
    'inventario', json_build_object(
      'kpis', (
        SELECT json_build_object(
          'totalItemsInv',   COUNT(*),
          'itemsConStock',   COUNT(*) FILTER (WHERE saldo_existencias > 0),
          'valorInventario', COALESCE(ROUND(SUM(saldo_existencias * costo_unitario)::numeric, 2), 0)
        ) FROM inventario
      ),
      'porArea', (
        SELECT json_agg(r ORDER BY r.valor DESC)
        FROM (
          SELECT area, COUNT(*) AS items,
                 ROUND(SUM(saldo_existencias * costo_unitario)::numeric, 2) AS valor
          FROM inventario WHERE area IS NOT NULL
          GROUP BY area ORDER BY valor DESC
        ) r
      ),
      'porCategoria', (
        SELECT json_agg(r ORDER BY r.items DESC)
        FROM (
          SELECT categoria, COUNT(*) AS items,
                 COUNT(*) FILTER (WHERE saldo_existencias > 0) AS "conStock"
          FROM inventario WHERE categoria IS NOT NULL
          GROUP BY categoria ORDER BY items DESC LIMIT 12
        ) r
      )
    )
  );
$_$;


ALTER FUNCTION "public"."get_dashboard_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_data"("p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_compras_kpis JSONB;
  v_compras_por_area JSONB;
  v_compras_top_prov JSONB;
  v_compras_por_mes JSONB;
  v_compras_por_tipo JSONB;
  v_compras_años JSONB;
  v_inventario_kpis JSONB;
  v_inventario_por_area JSONB;
  v_inventario_por_cat JSONB;
  v_result JSONB;
BEGIN
  -- 1. KPIs de Compras
  SELECT jsonb_build_object(
    'totalGasto', COALESCE(SUM(valor_total), 0),
    'totalOCs', COUNT(DISTINCT numero_oc),
    'cerradas', COUNT(*) FILTER (WHERE estado = 'CERRADA'),
    'abiertas', COUNT(*) FILTER (WHERE estado != 'CERRADA' OR estado IS NULL),
    'pctCerrado', CASE WHEN COUNT(DISTINCT numero_oc) > 0 
                  THEN ROUND((COUNT(*) FILTER (WHERE estado = 'CERRADA')::NUMERIC / COUNT(*)::NUMERIC) * 100)
                  ELSE 0 END,
    'totalPorPagar', COALESCE(SUM(saldo), 0)
  ) INTO v_compras_kpis
  FROM registro_compras
  WHERE (p_year IS NULL OR EXTRACT(YEAR FROM fecha_oc) = p_year);

  -- 2. Gasto por Área
  SELECT jsonb_agg(r) INTO v_compras_por_area
  FROM (
    SELECT area, SUM(valor_total) as total
    FROM registro_compras
    WHERE (p_year IS NULL OR EXTRACT(YEAR FROM fecha_oc) = p_year)
    GROUP BY area
    ORDER BY total DESC
  ) r;

  -- 3. Top Proveedores
  SELECT jsonb_agg(r) INTO v_compras_top_prov
  FROM (
    SELECT proveedor, SUM(valor_total) as total, COUNT(DISTINCT numero_oc) as ocs
    FROM registro_compras
    WHERE (p_year IS NULL OR EXTRACT(YEAR FROM fecha_oc) = p_year)
    GROUP BY proveedor
    ORDER BY total DESC
    LIMIT 10
  ) r;

  -- 4. Gasto por Mes (basado en mes_pago que es texto en el Excel)
  SELECT jsonb_agg(r) INTO v_compras_por_mes
  FROM (
    SELECT mes_pago as mes, SUM(valor_total) as total
    FROM registro_compras
    WHERE (p_year IS NULL OR EXTRACT(YEAR FROM fecha_oc) = p_year)
    AND mes_pago IS NOT NULL
    GROUP BY mes_pago
    ORDER BY MIN(fecha_oc) -- Ordenar por la primera fecha encontrada en ese mes
  ) r;

  -- 5. Gasto por Tipo
  SELECT jsonb_agg(r) INTO v_compras_por_tipo
  FROM (
    SELECT tipo_compra as tipo, SUM(valor_total) as total
    FROM registro_compras
    WHERE (p_year IS NULL OR EXTRACT(YEAR FROM fecha_oc) = p_year)
    GROUP BY tipo_compra
    ORDER BY total DESC
    LIMIT 10
  ) r;

  -- 6. Años disponibles
  SELECT jsonb_agg(y) INTO v_compras_años
  FROM (
    SELECT DISTINCT EXTRACT(YEAR FROM fecha_oc)::INTEGER as y
    FROM registro_compras
    WHERE fecha_oc IS NOT NULL
    ORDER BY y DESC
  ) t;

  -- 7. KPIs de Inventario
  SELECT jsonb_build_object(
    'totalItemsInv', COUNT(*),
    'itemsConStock', COUNT(*) FILTER (WHERE saldo_existencias > 0),
    'valorInventario', COALESCE(SUM(saldo_existencias * costo_unitario), 0)
  ) INTO v_inventario_kpis
  FROM inventario;

  -- 8. Inventario por Área
  SELECT jsonb_agg(r) INTO v_inventario_por_area
  FROM (
    SELECT area, COUNT(*) as items, SUM(saldo_existencias * costo_unitario) as valor
    FROM inventario
    GROUP BY area
    ORDER BY valor DESC
  ) r;

  -- 9. Inventario por Categoría
  SELECT jsonb_agg(r) INTO v_inventario_por_cat
  FROM (
    SELECT categoria, COUNT(*) as items, COUNT(*) FILTER (WHERE saldo_existencias > 0) as conStock
    FROM inventario
    GROUP BY categoria
    ORDER BY items DESC
  ) r;

  -- Construir resultado final
  v_result := jsonb_build_object(
    'compras', jsonb_build_object(
      'kpis', v_compras_kpis,
      'porArea', COALESCE(v_compras_por_area, '[]'::jsonb),
      'topProveedores', COALESCE(v_compras_top_prov, '[]'::jsonb),
      'porMes', COALESCE(v_compras_por_mes, '[]'::jsonb),
      'porTipo', COALESCE(v_compras_por_tipo, '[]'::jsonb),
      'años', COALESCE(v_compras_años, '[]'::jsonb)
    ),
    'inventario', jsonb_build_object(
      'kpis', v_inventario_kpis,
      'porArea', COALESCE(v_inventario_por_area, '[]'::jsonb),
      'porCategoria', COALESCE(v_inventario_por_cat, '[]'::jsonb)
    )
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_data"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."siguiente_numero_np"("p_year" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO np_secuencia (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = np_secuencia.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;


ALTER FUNCTION "public"."siguiente_numero_np"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."siguiente_numero_oc"("p_year" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_numero INTEGER;
BEGIN
  INSERT INTO oc_secuencia (año, ultimo_numero) VALUES (p_year, 1)
  ON CONFLICT (año) DO UPDATE SET ultimo_numero = oc_secuencia.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;


ALTER FUNCTION "public"."siguiente_numero_oc"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."acciones_gestion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden" integer NOT NULL,
    "descripcion" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."acciones_gestion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auditoria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usuario_id" "uuid",
    "usuario_email" "text",
    "usuario_nombre" "text",
    "rol" "text",
    "accion" "text" NOT NULL,
    "entidad" "text" NOT NULL,
    "entidad_id" "text",
    "referencia" "text",
    "detalle" "jsonb"
);


ALTER TABLE "public"."auditoria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion_empresa" (
    "id" integer DEFAULT 1 NOT NULL,
    "razon_social" "text" DEFAULT 'ARLIFT ENGINEERING & SERVICES S.A.'::"text" NOT NULL,
    "ruc" "text",
    "direccion" "text",
    "contacto" "text",
    "telefono" "text",
    "email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "documento_numero_oc" "text" DEFAULT 'AL-L4-07-F01'::"text",
    "revision_oc" integer DEFAULT 1,
    "documento_numero_np" "text" DEFAULT 'AL-L4-07-F01'::"text" NOT NULL,
    "revision_np" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."configuracion_empresa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coordinadores_area" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "area" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coordinadores_area" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feriados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "descripcion" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feriados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_np" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "np_id" "uuid" NOT NULL,
    "estado" "text" NOT NULL,
    "actor_email" "text",
    "actor_nombre" "text",
    "notas" "text",
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."historial_np" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "descripcion" "text" NOT NULL,
    "area" "text",
    "categoria" "text",
    "saldo_existencias" numeric(10,2) DEFAULT 0,
    "costo_unitario" numeric(12,2) DEFAULT 0,
    "locacion" "text",
    "codigo_origen" "text",
    "descripcion_origen" "text",
    "marca" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "observaciones" "text"
);


ALTER TABLE "public"."inventario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items_np" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nota_pedido_id" "uuid" NOT NULL,
    "linea" integer NOT NULL,
    "descripcion" "text" NOT NULL,
    "unidad" "text" NOT NULL,
    "cantidad" numeric(10,2) NOT NULL,
    "precio_unitario" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) GENERATED ALWAYS AS (("cantidad" * "precio_unitario")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "codigo" "text",
    "proveedor_sugerido" "text",
    "fecha_requerida" "date",
    "accion_id" "uuid",
    "accion_marcada_en" timestamp with time zone,
    "accion_marcada_por" "uuid"
);


ALTER TABLE "public"."items_np" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items_oc" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_compras_id" "uuid" NOT NULL,
    "linea" integer NOT NULL,
    "codigo" "text",
    "descripcion" "text" NOT NULL,
    "unidad" "text" NOT NULL,
    "cantidad" numeric(10,2) NOT NULL,
    "precio_unitario" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) GENERATED ALWAYS AS (("cantidad" * "precio_unitario")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "item_np_id" "uuid",
    "tipo" "text",
    "informacion_adicional" "text",
    "fecha_entrega" "date",
    "justificacion_cantidad" "text"
);


ALTER TABLE "public"."items_oc" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notas_pedido" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text" NOT NULL,
    "solicitante_nombre" "text" NOT NULL,
    "solicitante_email" "text" NOT NULL,
    "area" "text" NOT NULL,
    "prioridad" "text" NOT NULL,
    "tipo_compra" "text" NOT NULL,
    "centro_costo" "text" NOT NULL,
    "descripcion_general" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "motivo_rechazo" "text",
    "token_aprobacion" "uuid" DEFAULT "gen_random_uuid"(),
    "total_estimado" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "motivo_devolucion" "text",
    "token_edicion" "uuid" DEFAULT "gen_random_uuid"(),
    "convertida" boolean DEFAULT false,
    "token_devolucion" "uuid" DEFAULT "gen_random_uuid"(),
    "asignado_a" "uuid",
    "asignado_en" timestamp with time zone,
    "asignado_nombre" "text",
    "asignado_email" "text",
    "creado_por_id" "uuid",
    "aprobador_np_nombre" "text",
    "aprobador_np_area" "text",
    "completado_manualmente" boolean DEFAULT false,
    "motivo_completado" "text",
    "es_regularizacion" boolean DEFAULT false NOT NULL,
    "fecha_provision" "date",
    "proveedor_regularizacion_nombre" "text",
    "proveedor_regularizacion_identificacion" "text",
    "condiciones_minimas" "text",
    "sla_iniciado_en" timestamp with time zone,
    "sla_pausado_desde" timestamp with time zone,
    "sla_pausado_acumulado_seg" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "notas_pedido_centro_costo_check" CHECK (("centro_costo" = ANY (ARRAY['costo'::"text", 'gasto'::"text", 'activo'::"text", 'inventario'::"text"]))),
    CONSTRAINT "notas_pedido_estado_check" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'pendiente'::"text", 'aprobada'::"text", 'rechazada'::"text", 'devuelta'::"text", 'en_gestion'::"text", 'oc_directa'::"text", 'oc_generada'::"text", 'oc_en_aprobacion'::"text", 'oc_aprobada'::"text", 'completada'::"text"]))),
    CONSTRAINT "notas_pedido_prioridad_check" CHECK (("prioridad" = ANY (ARRAY['excepcional'::"text", 'alta'::"text", 'media'::"text", 'baja'::"text"]))),
    CONSTRAINT "notas_pedido_tipo_compra_check" CHECK (("tipo_compra" = ANY (ARRAY['producto'::"text", 'servicio'::"text", 'alquiler'::"text", 'importacion'::"text", 'consumible'::"text"])))
);


ALTER TABLE "public"."notas_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."np_secuencia" (
    "año" integer NOT NULL,
    "ultimo_numero" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."np_secuencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oc_secuencia" (
    "año" integer NOT NULL,
    "ultimo_numero" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."oc_secuencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "perfiles_rol_check" CHECK (("rol" = ANY (ARRAY['solicitante'::"text", 'bodega'::"text", 'coordinador'::"text", 'compras'::"text", 'gerencia'::"text", 'consulta'::"text", 'admin'::"text", 'asistente_compras'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "clasificacion" "text",
    "categoria" "text",
    "ciudad" "text",
    "giro_negocio" "text",
    "telefono" "text",
    "email" "text",
    "contacto" "text",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ruc" "text",
    "direccion" "text"
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registro_compras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item" integer,
    "fecha_np" "date",
    "numero_np" "text",
    "proveedor" "text",
    "fecha_oc" "date",
    "numero_oc" "text",
    "descripcion_oc" "text",
    "area" "text",
    "area_funcional" "text",
    "tipo_servicio_material" "text",
    "cargado_a" "text",
    "descripcion_final" "text",
    "centro_costo" "text",
    "tipo_compra" "text",
    "numero_factura" "text",
    "fecha_factura" "date",
    "valor_total" numeric(12,2) DEFAULT 0,
    "valor_retenido" numeric(12,2) DEFAULT 0,
    "valor_a_pagar" numeric(12,2) DEFAULT 0,
    "banco" "text",
    "tipo_pago" "text",
    "mes_pago" "text",
    "abono" numeric(12,2) DEFAULT 0,
    "saldo" numeric(12,2) DEFAULT 0,
    "dias_credito" integer DEFAULT 0,
    "fecha_vencimiento" "date",
    "estado" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nota_pedido_id" "uuid",
    "proveedor_id" "uuid",
    "estado_oc" "text" DEFAULT 'en_proceso'::"text" NOT NULL,
    "creado_por_id" "uuid",
    "creado_por_nombre" "text",
    "proveedor_ruc" "text",
    "proveedor_direccion" "text",
    "proveedor_telefono" "text",
    "proveedor_contacto" "text",
    "proveedor_email" "text",
    "numero_cotizacion" "text",
    "aprobado_por_nombre" "text",
    "condiciones_minimas" "text",
    "aprobador_np_nombre" "text",
    "aprobador_np_area" "text",
    "aprobado_por_rol" "text",
    "motivo_cancelacion" "text",
    CONSTRAINT "registro_compras_estado_oc_check" CHECK (("estado_oc" = ANY (ARRAY['en_proceso'::"text", 'en_aprobacion_compras'::"text", 'en_aprobacion_gerencia'::"text", 'aprobada'::"text", 'rechazada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."registro_compras" OWNER TO "postgres";


ALTER TABLE ONLY "public"."acciones_gestion"
    ADD CONSTRAINT "acciones_gestion_orden_key" UNIQUE ("orden");



ALTER TABLE ONLY "public"."acciones_gestion"
    ADD CONSTRAINT "acciones_gestion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_empresa"
    ADD CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coordinadores_area"
    ADD CONSTRAINT "coordinadores_area_area_key" UNIQUE ("area");



ALTER TABLE ONLY "public"."coordinadores_area"
    ADD CONSTRAINT "coordinadores_area_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feriados"
    ADD CONSTRAINT "feriados_fecha_key" UNIQUE ("fecha");



ALTER TABLE ONLY "public"."feriados"
    ADD CONSTRAINT "feriados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_np"
    ADD CONSTRAINT "historial_np_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario"
    ADD CONSTRAINT "inventario_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."inventario"
    ADD CONSTRAINT "inventario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."items_np"
    ADD CONSTRAINT "items_np_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."items_oc"
    ADD CONSTRAINT "items_oc_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notas_pedido"
    ADD CONSTRAINT "notas_pedido_numero_key" UNIQUE ("numero");



ALTER TABLE ONLY "public"."notas_pedido"
    ADD CONSTRAINT "notas_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."np_secuencia"
    ADD CONSTRAINT "np_secuencia_pkey" PRIMARY KEY ("año");



ALTER TABLE ONLY "public"."oc_secuencia"
    ADD CONSTRAINT "oc_secuencia_pkey" PRIMARY KEY ("año");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_compras"
    ADD CONSTRAINT "registro_compras_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_auditoria_accion" ON "public"."auditoria" USING "btree" ("accion");



CREATE INDEX "idx_auditoria_created_at" ON "public"."auditoria" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_auditoria_entidad" ON "public"."auditoria" USING "btree" ("entidad");



CREATE INDEX "idx_auditoria_usuario_email" ON "public"."auditoria" USING "btree" ("usuario_email");



CREATE INDEX "idx_historial_np_fecha" ON "public"."historial_np" USING "btree" ("fecha");



CREATE INDEX "idx_historial_np_np_id" ON "public"."historial_np" USING "btree" ("np_id");



CREATE INDEX "idx_inv_area" ON "public"."inventario" USING "btree" ("area");



CREATE INDEX "idx_inv_categoria" ON "public"."inventario" USING "btree" ("categoria");



CREATE INDEX "idx_items_oc_oc_id" ON "public"."items_oc" USING "btree" ("registro_compras_id");



CREATE INDEX "idx_notas_pedido_estado" ON "public"."notas_pedido" USING "btree" ("estado");



CREATE INDEX "idx_proveedores_nombre" ON "public"."proveedores" USING "btree" ("nombre");



CREATE INDEX "idx_rc_area" ON "public"."registro_compras" USING "btree" ("area");



CREATE INDEX "idx_rc_estado" ON "public"."registro_compras" USING "btree" ("estado");



CREATE INDEX "idx_rc_fecha_oc" ON "public"."registro_compras" USING "btree" ("fecha_oc");



CREATE INDEX "idx_rc_mes_pago" ON "public"."registro_compras" USING "btree" ("mes_pago");



CREATE INDEX "idx_rc_proveedor" ON "public"."registro_compras" USING "btree" ("proveedor");



CREATE OR REPLACE TRIGGER "trg_np_updated_at" BEFORE UPDATE ON "public"."notas_pedido" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."historial_np"
    ADD CONSTRAINT "historial_np_np_id_fkey" FOREIGN KEY ("np_id") REFERENCES "public"."notas_pedido"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items_np"
    ADD CONSTRAINT "items_np_accion_id_fkey" FOREIGN KEY ("accion_id") REFERENCES "public"."acciones_gestion"("id");



ALTER TABLE ONLY "public"."items_np"
    ADD CONSTRAINT "items_np_accion_marcada_por_fkey" FOREIGN KEY ("accion_marcada_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."items_np"
    ADD CONSTRAINT "items_np_nota_pedido_id_fkey" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."notas_pedido"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items_oc"
    ADD CONSTRAINT "items_oc_item_np_id_fkey" FOREIGN KEY ("item_np_id") REFERENCES "public"."items_np"("id");



ALTER TABLE ONLY "public"."items_oc"
    ADD CONSTRAINT "items_oc_registro_compras_id_fkey" FOREIGN KEY ("registro_compras_id") REFERENCES "public"."registro_compras"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notas_pedido"
    ADD CONSTRAINT "notas_pedido_asignado_a_fkey" FOREIGN KEY ("asignado_a") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notas_pedido"
    ADD CONSTRAINT "notas_pedido_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registro_compras"
    ADD CONSTRAINT "registro_compras_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."registro_compras"
    ADD CONSTRAINT "registro_compras_nota_pedido_id_fkey" FOREIGN KEY ("nota_pedido_id") REFERENCES "public"."notas_pedido"("id");



ALTER TABLE ONLY "public"."registro_compras"
    ADD CONSTRAINT "registro_compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id");



ALTER TABLE "public"."acciones_gestion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_escribe" ON "public"."perfiles" USING (false) WITH CHECK (false);



CREATE POLICY "anon_insert_inventario" ON "public"."inventario" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_items_np" ON "public"."items_np" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_notas_pedido" ON "public"."notas_pedido" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_read_coordinadores" ON "public"."coordinadores_area" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read_inventario" ON "public"."inventario" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read_items_np" ON "public"."items_np" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read_notas_pedido" ON "public"."notas_pedido" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read_registro_compras" ON "public"."registro_compras" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_update_notas_pedido" ON "public"."notas_pedido" FOR UPDATE TO "anon" USING (true);



ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracion_empresa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coordinadores_area" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feriados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_np" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items_np" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items_oc" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notas_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."np_secuencia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oc_secuencia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "perfil_propio" ON "public"."perfiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registro_compras" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_data"("p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_data"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_data"("p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."siguiente_numero_np"("p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."siguiente_numero_np"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."siguiente_numero_np"("p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."siguiente_numero_oc"("p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."siguiente_numero_oc"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."siguiente_numero_oc"("p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."acciones_gestion" TO "anon";
GRANT ALL ON TABLE "public"."acciones_gestion" TO "authenticated";
GRANT ALL ON TABLE "public"."acciones_gestion" TO "service_role";



GRANT ALL ON TABLE "public"."auditoria" TO "anon";
GRANT ALL ON TABLE "public"."auditoria" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria" TO "service_role";



GRANT ALL ON TABLE "public"."configuracion_empresa" TO "anon";
GRANT ALL ON TABLE "public"."configuracion_empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracion_empresa" TO "service_role";



GRANT ALL ON TABLE "public"."coordinadores_area" TO "anon";
GRANT ALL ON TABLE "public"."coordinadores_area" TO "authenticated";
GRANT ALL ON TABLE "public"."coordinadores_area" TO "service_role";



GRANT ALL ON TABLE "public"."feriados" TO "anon";
GRANT ALL ON TABLE "public"."feriados" TO "authenticated";
GRANT ALL ON TABLE "public"."feriados" TO "service_role";



GRANT ALL ON TABLE "public"."historial_np" TO "anon";
GRANT ALL ON TABLE "public"."historial_np" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_np" TO "service_role";



GRANT ALL ON TABLE "public"."inventario" TO "anon";
GRANT ALL ON TABLE "public"."inventario" TO "authenticated";
GRANT ALL ON TABLE "public"."inventario" TO "service_role";



GRANT ALL ON TABLE "public"."items_np" TO "anon";
GRANT ALL ON TABLE "public"."items_np" TO "authenticated";
GRANT ALL ON TABLE "public"."items_np" TO "service_role";



GRANT ALL ON TABLE "public"."items_oc" TO "anon";
GRANT ALL ON TABLE "public"."items_oc" TO "authenticated";
GRANT ALL ON TABLE "public"."items_oc" TO "service_role";



GRANT ALL ON TABLE "public"."notas_pedido" TO "anon";
GRANT ALL ON TABLE "public"."notas_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."notas_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."np_secuencia" TO "anon";
GRANT ALL ON TABLE "public"."np_secuencia" TO "authenticated";
GRANT ALL ON TABLE "public"."np_secuencia" TO "service_role";



GRANT ALL ON TABLE "public"."oc_secuencia" TO "anon";
GRANT ALL ON TABLE "public"."oc_secuencia" TO "authenticated";
GRANT ALL ON TABLE "public"."oc_secuencia" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON TABLE "public"."registro_compras" TO "anon";
GRANT ALL ON TABLE "public"."registro_compras" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_compras" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







