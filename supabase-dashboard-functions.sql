-- ============================================================
-- REQSYS — Funciones para el Dashboard
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Eliminar la función si ya existe para evitar errores de tipo de retorno
DROP FUNCTION IF EXISTS get_dashboard_data(INTEGER);

CREATE OR REPLACE FUNCTION get_dashboard_data(p_year INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Permisos
GRANT EXECUTE ON FUNCTION get_dashboard_data(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_data(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_data(INTEGER) TO service_role;
