import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const ROJO_OSC = '#7f1d1d'
const ROJO     = '#991b1b'
const GRIS     = '#64748b'
const BORDER   = '#cbd5e1'
const BG_HDR   = '#fef2f2'

const styles = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 8, padding: 20, color: '#1e293b' },

  headerRow:   {
    flexDirection: 'row', alignItems: 'center', marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 2, borderBottomColor: ROJO_OSC, borderBottomStyle: 'solid',
  },
  logo:        { width: 60, height: 30, objectFit: 'contain' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Helvetica-Bold', color: ROJO_OSC },
  headerNum:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: ROJO, textAlign: 'right', minWidth: 70 },

  infoBar:     { flexDirection: 'row', backgroundColor: BG_HDR, padding: '3 6', marginBottom: 6, borderRadius: 2 },
  infoCell:    { flex: 1, flexDirection: 'column' },
  infoLabel:   { fontSize: 6, color: GRIS, textTransform: 'uppercase' },
  infoVal:     { fontSize: 7, fontFamily: 'Helvetica-Bold' },

  sectionLabel: {
    backgroundColor: ROJO_OSC, color: 'white', fontSize: 7,
    fontFamily: 'Helvetica-Bold', padding: '2 6', marginBottom: 0,
  },

  infoGenBox:  { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginBottom: 6, padding: 5 },
  rowKV:       { flexDirection: 'row', marginBottom: 3 },
  kvLabel:     { fontSize: 7, color: GRIS, width: 160 },
  kvVal:       { fontSize: 7, flex: 1 },

  descBox:     { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginBottom: 6, minHeight: 30, padding: '4 6' },
  descText:    { fontSize: 7 },

  tableHead:   { flexDirection: 'row', backgroundColor: ROJO_OSC, padding: '3 0' },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid', minHeight: 18 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid', minHeight: 18, backgroundColor: '#fff5f5' },
  thCell:      { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 2 },
  tdCell:      { fontSize: 7, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 3 },
  tdLeft:      { fontSize: 7, textAlign: 'left', paddingHorizontal: 3, paddingVertical: 3 },

  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', padding: '2 6', borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid' },
  totalLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', marginRight: 12 },
  totalVal:    { fontSize: 7, fontFamily: 'Helvetica-Bold', width: 70, textAlign: 'right' },

  condBox:     { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginTop: 6, marginBottom: 6 },
  condText:    { fontSize: 7, padding: '4 6', minHeight: 28 },

  aprobRow:      { flexDirection: 'row', borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginTop: 6 },
  aprobCell:     { flex: 1, borderRightWidth: 1, borderRightColor: BORDER, borderRightStyle: 'solid', padding: 5, minHeight: 55 },
  aprobCellLast: { flex: 1, padding: 5, minHeight: 55 },
  aprobHead:     { backgroundColor: ROJO, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, padding: '2 4', textAlign: 'center' },
  aprobName:     { fontSize: 7, marginTop: 4 },
  aprobCargo:    { fontSize: 6, color: GRIS, marginTop: 1 },
  aprobFirma:    { fontSize: 6, color: GRIS, marginTop: 14 },
})

// Spec CA-07: anchos de columna condicionales al permiso de precio
const COL_CON_PRECIO    = { num:'4%', tipo:'6%', cod:'7%', desc:'22%', und:'4%', qty:'5%', info:'14%', pu:'8%', ptotal:'8%', fecha:'8%', prov:'14%' }
const COL_SIN_PRECIO    = { num:'4%', tipo:'6%', cod:'7%', desc:'28%', und:'4%', qty:'5%', info:'18%',                      fecha:'12%', prov:'16%' }

function usd(n: number | null | undefined) { return `$${Number(n ?? 0).toFixed(2)}` }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

export interface NPExportData {
  numero: string
  area: string
  clasificacion: string | null
  prioridad: string | null
  tipo_compra: string | null
  centro_costo: string | null
  descripcion_general: string | null
  created_at: string
  es_regularizacion: boolean
  fecha_provision: string | null
  proveedor_regularizacion_nombre: string | null
  proveedor_regularizacion_identificacion: string | null
  solicitante_nombre: string
  aprobador_np_nombre: string | null
  aprobador_np_area: string | null
  condiciones_minimas: string | null
}

export interface ItemNPExport {
  linea: number
  tipo: string | null
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number | null
  total_estimado: number | null
  informacion_adicional: string | null
  proveedor_sugerido: string | null
  fecha_requerida: string | null
}

export function NPDocumento({ np, items, mostrarPrecios, config, logoUrl }: {
  np: NPExportData
  items: ItemNPExport[]
  mostrarPrecios: boolean
  config: { documento_numero_np: string; revision_np: number }
  logoUrl: string
}) {
  const COL = mostrarPrecios ? COL_CON_PRECIO : COL_SIN_PRECIO
  const totalSinIVA = items.reduce((acc, it) => acc + Number(it.total_estimado ?? 0), 0)
  const iva         = totalSinIVA * 0.15
  const totalConIVA = totalSinIVA + iva

  // Spec CA-05: checkboxes de regularización
  const regNo = `${np.es_regularizacion ? '☐' : '☑'} NO`
  const regSi = `${np.es_regularizacion ? '☑' : '☐'} SÍ`

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* Spec CA-04: Header */}
        <View style={styles.headerRow}>
          {logoUrl
            ? <Image src={logoUrl} style={styles.logo} />
            : <View style={styles.logo} />}
          <Text style={styles.headerTitle}>NOTA DE PEDIDO</Text>
          <Text style={styles.headerNum}>No. {np.numero}</Text>
        </View>

        {/* Spec CA-04: Info bar */}
        <View style={styles.infoBar}>
          {([
            ['DOCUMENTO NÚMERO', config.documento_numero_np],
            ['REVISIÓN',         String(config.revision_np)],
            ['FECHA EMISIÓN',    fmtDate(np.created_at)],
            ['AREA',             np.area],
            ['CLASIFICACIÓN',    np.clasificacion ?? 'Formatos, L4'],
          ] as [string, string][]).map(([lbl, val]) => (
            <View key={lbl} style={styles.infoCell}>
              <Text style={styles.infoLabel}>{lbl}</Text>
              <Text style={styles.infoVal}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Spec CA-05: Información General */}
        <Text style={styles.sectionLabel}>INFORMACIÓN GENERAL</Text>
        <View style={styles.infoGenBox}>
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>PRIORIDAD</Text>
            <Text style={styles.kvVal}>{np.prioridad ?? '—'}</Text>
          </View>
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>TIPO:</Text>
            <Text style={styles.kvVal}>{np.tipo_compra ?? ''}</Text>
          </View>
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>CENTRO DE COSTOS</Text>
            <Text style={styles.kvVal}>{np.centro_costo ?? ''}</Text>
          </View>
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>REGULARIZACIÓN:</Text>
            <Text style={styles.kvVal}>{regNo}    {regSi}</Text>
          </View>
          {/* Spec CA-05: campos condicionales de regularización */}
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>
              {'FECHA DE PROVISIÓN DEL BIEN O SERVICIO\n(SI LA RESPUESTA A REGULARIZACIÓN ES SÍ:)'}
            </Text>
            <Text style={styles.kvVal}>{np.es_regularizacion ? fmtDate(np.fecha_provision) : ''}</Text>
          </View>
          <View style={styles.rowKV}>
            <Text style={styles.kvLabel}>
              {'INGRESAR PROVEEDOR EN CASO DE QUE LA\nRESPUESTA A REGULARIZACIÓN SEA SÍ:'}
            </Text>
            <Text style={styles.kvVal}>
              {np.es_regularizacion
                ? [np.proveedor_regularizacion_nombre, np.proveedor_regularizacion_identificacion]
                    .filter(Boolean).join(' — ')
                : ''}
            </Text>
          </View>
        </View>

        {/* Spec CA-06: Descripción General */}
        <Text style={styles.sectionLabel}>DESCRIPCION GENERAL</Text>
        <View style={styles.descBox}>
          <Text style={styles.descText}>{np.descripcion_general ?? ''}</Text>
        </View>

        {/* Spec CA-07: Tabla de ítems */}
        <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'solid' }}>
          <View style={styles.tableHead}>
            <Text style={{ ...styles.thCell, width: COL.num }}>ITEM #</Text>
            <Text style={{ ...styles.thCell, width: COL.tipo }}>TIPO</Text>
            <Text style={{ ...styles.thCell, width: COL.cod }}>CÓDIGO</Text>
            <Text style={{ ...styles.thCell, width: COL.desc }}>DESCRIPCIÓN DEL BIEN O SERVICIO</Text>
            <Text style={{ ...styles.thCell, width: COL.und }}>UNIDAD</Text>
            <Text style={{ ...styles.thCell, width: COL.qty }}>QTY SOLIC.</Text>
            <Text style={{ ...styles.thCell, width: COL.info }}>INFORMACIÓN ADICIONAL</Text>
            {mostrarPrecios && <Text style={{ ...styles.thCell, width: COL_CON_PRECIO.pu }}>P. UNIT. (USD)</Text>}
            {mostrarPrecios && <Text style={{ ...styles.thCell, width: COL_CON_PRECIO.ptotal }}>P. TOTAL (USD)</Text>}
            <Text style={{ ...styles.thCell, width: COL.fecha }}>FECHA REQUERIDA</Text>
            <Text style={{ ...styles.thCell, width: COL.prov }}>PROVEEDOR SUGERIDO</Text>
          </View>
          {items.map((it, i) => (
            <View key={it.linea} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tdCell, width: COL.num }}>{it.linea}</Text>
              <Text style={{ ...styles.tdCell, width: COL.tipo }}>{it.tipo ?? ''}</Text>
              <Text style={{ ...styles.tdCell, width: COL.cod, fontSize: 6 }}>{it.codigo ?? ''}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.desc }}>{it.descripcion}</Text>
              <Text style={{ ...styles.tdCell, width: COL.und }}>{it.unidad}</Text>
              <Text style={{ ...styles.tdCell, width: COL.qty }}>{it.cantidad}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.info, fontSize: 6 }}>{it.informacion_adicional ?? ''}</Text>
              {mostrarPrecios && (
                <Text style={{ ...styles.tdCell, width: COL_CON_PRECIO.pu }}>{usd(it.precio_unitario)}</Text>
              )}
              {mostrarPrecios && (
                <Text style={{ ...styles.tdCell, width: COL_CON_PRECIO.ptotal }}>{usd(it.total_estimado)}</Text>
              )}
              <Text style={{ ...styles.tdCell, width: COL.fecha, fontSize: 6 }}>{fmtDate(it.fecha_requerida)}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.prov, fontSize: 6 }}>{it.proveedor_sugerido ?? ''}</Text>
            </View>
          ))}
        </View>

        {/* Spec CA-08: Totales — solo si mostrarPrecios */}
        {mostrarPrecios && (
          <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderTopWidth: 0 }}>
            {([
              ['VALOR TOTAL DEL REQUERIMIENTO (USD) — sin IVA:', usd(totalSinIVA)],
              ['IVA 15%:', usd(iva)],
              ['VALOR TOTAL CON IVA 15%:', usd(totalConIVA)],
            ] as [string, string][]).map(([lbl, val]) => (
              <View key={lbl} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{lbl}</Text>
                <Text style={styles.totalVal}>{val}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Spec CA-09: Condiciones mínimas */}
        <Text style={{ ...styles.sectionLabel, marginTop: 6 }}>
          CONDICIONES MÍNIMAS PARA PROVEEDORES (certificaciones, normas, fichas técnicas, etc.)
        </Text>
        <View style={styles.condBox}>
          <Text style={styles.condText}>{np.condiciones_minimas ?? ''}</Text>
        </View>

        {/* Spec CA-10: Aprobaciones */}
        <Text style={styles.sectionLabel}>APROBACIONES</Text>
        <View style={styles.aprobRow}>
          <View style={styles.aprobCell}>
            <Text style={styles.aprobHead}>ELABORADO POR</Text>
            <Text style={styles.aprobCargo}>{np.area}</Text>
            <Text style={styles.aprobName}>{np.solicitante_nombre}</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
          <View style={styles.aprobCellLast}>
            <Text style={styles.aprobHead}>APROBADO POR</Text>
            <Text style={styles.aprobCargo}>{np.aprobador_np_area ?? ''}</Text>
            <Text style={styles.aprobName}>{np.aprobador_np_nombre ?? ''}</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
