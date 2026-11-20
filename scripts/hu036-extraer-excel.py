"""
HU-036: extraccion real de PRODUCTOS y KARDEX desde el Excel de ARLIFT hacia un
JSON intermedio. Lectura pura (sin logica de negocio: ni promedio ponderado ni
mapeo de catalogo) -- ver lib/bodega-kardex.ts / hu036-migrar-dev-local.mjs
para la parte de logica real.

Uso:
  python hu036-extraer-excel.py <ruta_excel.xlsx> <ruta_salida.json>
"""
import sys
import json
import datetime as _dt
import openpyxl

TIPO_MAP = {
    "compra": "compra",
    "devolucion": "devolucion",
    "devolución": "devolucion",
    "reconteo": "reconteo",
    "field build": "field_build",
    "field_build": "field_build",
    "venta": "venta",
    "prestamo": "prestamo",
    "préstamo": "prestamo",
    "gasto": "gasto",
}


def normalizar_tipo(valor):
    if valor is None:
        return None, None
    txt = str(valor).strip().lower()
    mapeado = TIPO_MAP.get(txt)
    return mapeado, txt


def main():
    if len(sys.argv) != 3:
        print("Uso: python hu036-extraer-excel.py <excel> <salida.json>")
        sys.exit(1)

    ruta_excel, ruta_salida = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(ruta_excel, data_only=True, read_only=True)

    # --- PRODUCTOS ---
    ws_prod = wb["PRODUCTOS"]
    productos = []
    areas_set = set()
    categorias_set = set()
    area_cat = {}

    for row in ws_prod.iter_rows(min_row=8, values_only=True):
        codigo = row[1]
        if codigo is None:
            continue
        codigo = str(codigo).strip()
        desc = row[2]
        area = row[3].strip() if isinstance(row[3], str) else row[3]
        cat = row[4].strip() if isinstance(row[4], str) else row[4]
        saldo = row[5] if isinstance(row[5], (int, float)) else 0
        costo = row[6] if isinstance(row[6], (int, float)) else 0
        locacion = row[7] if len(row) > 7 else None
        codigo_origen = row[8] if len(row) > 8 else None
        descripcion_origen = row[9] if len(row) > 9 else None
        marca = row[10] if len(row) > 10 else None
        observaciones = row[11] if len(row) > 11 else None

        # Fila de encabezado residual (p.ej. "Categoria"/"Área" repetida como
        # dato) -- se descarta explicitamente, nunca como producto real.
        if codigo.lower() in ("codigo", "código"):
            continue

        productos.append({
            "codigo": codigo,
            "descripcion": desc,
            "area_texto": area,
            "categoria_texto": cat,
            "saldo_excel": saldo,
            "costo_excel": costo,
            "locacion": locacion,
            "codigo_origen": codigo_origen,
            "descripcion_origen": descripcion_origen,
            "marca": marca,
            "observaciones": observaciones,
        })

        if area and area.lower() not in ("área", "area"):
            areas_set.add(area)
        if cat and str(cat).lower() not in ("categoria", "categoría"):
            categorias_set.add(cat)
        if area and cat and area.lower() not in ("área", "area") and str(cat).lower() not in ("categoria", "categoría"):
            area_cat.setdefault(cat, set()).add(area)

    # --- KARDEX ---
    ws_kdx = wb["KARDEX"]
    movimientos = []
    tipos_sin_mapear = set()

    for i, row in enumerate(ws_kdx.iter_rows(min_row=9, values_only=True)):
        fecha, mov, tipo_raw, codigo = row[1], row[2], row[3], row[4]
        qty = row[11] if len(row) > 11 else None
        costo_unit_sheet = row[12] if len(row) > 12 else None

        if codigo is None:
            continue
        codigo = str(codigo).strip()

        tipo_mapeado, tipo_normalizado = normalizar_tipo(tipo_raw)
        if tipo_mapeado is None:
            tipos_sin_mapear.add(tipo_normalizado)

        mov_norm = (mov or "").strip().lower()
        fecha_iso = fecha.isoformat() if isinstance(fecha, _dt.datetime) else None

        movimientos.append({
            "fila": i + 9,
            "fecha": fecha_iso,
            "mov": mov_norm,
            "tipo_excel": tipo_normalizado,
            "tipo": tipo_mapeado,
            "codigo": codigo,
            "cantidad": qty if isinstance(qty, (int, float)) else 0,
            "costo_unit_sheet": costo_unit_sheet if isinstance(costo_unit_sheet, (int, float)) else None,
        })

    def _fecha_key(m):
        if m["fecha"]:
            return _dt.datetime.fromisoformat(m["fecha"])
        return _dt.datetime.min

    movimientos.sort(key=lambda m: (_fecha_key(m), m["fila"]))

    # Cruces area<->categoria con 2+ areas reales (confirmacion, no asuncion).
    multi_area = {c: sorted(a) for c, a in area_cat.items() if len(a) > 1}

    out = {
        "productos": productos,
        "movimientos": movimientos,
        "resumen": {
            "total_productos": len(productos),
            "total_movimientos": len(movimientos),
            "areas_reales": sorted(areas_set),
            "total_categorias_reales": len(categorias_set),
            "categorias_reales": sorted(categorias_set),
            "cruces_area_categoria": {c: sorted(a) for c, a in area_cat.items()},
            "categorias_multi_area": multi_area,
            "tipos_kardex_sin_mapear": sorted(t for t in tipos_sin_mapear if t),
        },
    }

    with open(ruta_salida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Productos reales: {len(productos)}")
    print(f"Movimientos reales: {len(movimientos)}")
    print(f"Areas reales: {sorted(areas_set)}")
    print(f"Categorias reales: {len(categorias_set)}")
    print(f"Categorias multi-area: {multi_area}")
    print(f"Tipos KARDEX sin mapear: {sorted(t for t in tipos_sin_mapear if t)}")
    print(f"JSON escrito en: {ruta_salida}")


if __name__ == "__main__":
    main()
