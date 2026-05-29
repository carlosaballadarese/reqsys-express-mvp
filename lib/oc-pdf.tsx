import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const TEAL   = '#0d2e2e'
const TEAL2  = '#1a5252'
const GRIS   = '#64748b'
const BORDER = '#cbd5e1'
const BG_HDR = '#f1f5f9'

const styles = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 8, padding: 20, color: '#1e293b' },
  headerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 4, borderBottom: `2 solid ${TEAL}`, paddingBottom: 4 },
  logo:        { width: 60, height: 30, objectFit: 'contain' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Helvetica-Bold', color: TEAL },
  headerNum:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: TEAL2, textAlign: 'right', minWidth: 70 },
  infoBar:     { flexDirection: 'row', backgroundColor: BG_HDR, padding: '3 6', marginBottom: 6, borderRadius: 2 },
  infoCell:    { flex: 1, flexDirection: 'column' },
  infoLabel:   { fontSize: 6, color: GRIS, textTransform: 'uppercase' },
  infoVal:     { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  sectionLabel:{ backgroundColor: TEAL, color: 'white', fontSize: 7, fontFamily: 'Helvetica-Bold', padding: '2 6', marginBottom: 0 },
  twoCol:      { flexDirection: 'row', border: `1 solid ${BORDER}`, marginBottom: 6 },
  col:         { flex: 1, padding: 5 },
  colRight:    { flex: 1, padding: 5, borderLeft: `1 solid ${BORDER}` },
  rowKV:       { flexDirection: 'row', marginBottom: 2 },
  kvLabel:     { fontSize: 7, color: GRIS, width: 60 },
  kvVal:       { fontSize: 7, flex: 1 },
  tableHead:   { flexDirection: 'row', backgroundColor: TEAL, padding: '3 0' },
  tableRow:    { flexDirection: 'row', borderBottom: `1 solid ${BORDER}`, minHeight: 18 },
  tableRowAlt: { flexDirection: 'row', borderBottom: `1 solid ${BORDER}`, minHeight: 18, backgroundColor: '#f8fafc' },
  thCell:      { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 2 },
  tdCell:      { fontSize: 7, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 3 },
  tdLeft:      { fontSize: 7, textAlign: 'left', paddingHorizontal: 3, paddingVertical: 3 },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', padding: '2 6', borderTop: `1 solid ${BORDER}` },
  totalLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', marginRight: 12 },
  totalVal:    { fontSize: 7, fontFamily: 'Helvetica-Bold', width: 70, textAlign: 'right' },
  condBox:     { border: `1 solid ${BORDER}`, marginTop: 6, marginBottom: 6 },
  condHint:    { fontSize: 6, color: GRIS, fontStyle: 'italic', padding: '3 5' },
  condText:    { fontSize: 7, padding: '2 5 6', minHeight: 28 },
  aprobRow:    { flexDirection: 'row', border: `1 solid ${BORDER}`, marginTop: 6 },
  aprobCell:   { flex: 1, borderRight: `1 solid ${BORDER}`, padding: 5, minHeight: 55 },
  aprobCellLast: { flex: 1, padding: 5, minHeight: 55 },
  aprobHead:   { backgroundColor: TEAL2, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, padding: '2 4', textAlign: 'center' },
  aprobName:   { fontSize: 7, marginTop: 4 },
  aprobCargo:  { fontSize: 6, color: GRIS, marginTop: 1 },
  aprobFirma:  { fontSize: 6, color: GRIS, marginTop: 14 },
})

function usd(n: number) { return `$${Number(n).toFixed(2)}` }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

const COL = { num:'4%', tipo:'8%', cod:'9%', desc:'25%', und:'5%', qty:'5%', info:'17%', pu:'9%', tot:'9%', fecha:'9%' }

export function OCDocument({ oc, items, empresa, logoSrc, creadorCargo }: {
  oc: any; items: any[]; empresa: any; logoSrc: string; creadorCargo: string
}) {
  const subtotal = Number(oc.valor_total) || 0
  const iva      = subtotal * 0.15
  const total    = subtotal + iva

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.headerRow}>
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : <View style={styles.logo} />}
          <Text style={styles.headerTitle}>ORDEN DE COMPRA</Text>
          <Text style={styles.headerNum}>No. {oc.numero_oc}</Text>
        </View>

        {/* Info bar */}
        <View style={styles.infoBar}>
          {([
            ['DOCUMENTO NUMERO', empresa?.documento_numero_oc ?? 'AL-L4-07-F01'],
            ['REVISIÓN',         String(empresa?.revision_oc ?? 1)],
            ['FECHA DE EMISIÓN', fmtDate(oc.fecha_oc ?? oc.created_at)],
            ['PREPARADO POR',    oc.creado_por_nombre ?? '—'],
            ['APROBADO POR',     oc.aprobado_por_nombre ?? '—'],
            ['CLASIFICACIÓN',    'Formatos, L4'],
          ] as [string, string][]).map(([lbl, val]) => (
            <View key={lbl} style={styles.infoCell}>
              <Text style={styles.infoLabel}>{lbl}</Text>
              <Text style={styles.infoVal}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Información General */}
        <Text style={styles.sectionLabel}>INFORMACIÓN GENERAL</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            {([
              ['PROVEEDOR', oc.proveedor],
              ['RUC',       oc.proveedor_ruc],
              ['DIRECCIÓN', oc.proveedor_direccion],
              ['CONTACTO',  oc.proveedor_contacto],
              ['TELÉFONO',  oc.proveedor_telefono],
              ['MAIL',      oc.proveedor_email],
            ] as [string, string][]).map(([k, v]) => (
              <View key={k} style={styles.rowKV}>
                <Text style={styles.kvLabel}>{k}</Text>
                <Text style={styles.kvVal}>{v ?? '—'}</Text>
              </View>
            ))}
          </View>
          <View style={styles.colRight}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>FACTURAR A:</Text>
            {([
              ['',          empresa?.razon_social],
              ['RUC',       empresa?.ruc],
              ['DIRECCIÓN', empresa?.direccion],
              ['CONTACTO',  empresa?.contacto],
              ['TELÉFONO',  empresa?.telefono],
              ['MAIL',      empresa?.email],
            ] as [string, string][]).map(([k, v], i) => (
              <View key={i} style={styles.rowKV}>
                <Text style={styles.kvLabel}>{k}</Text>
                <Text style={styles.kvVal}>{v ?? '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabla de ítems */}
        <Text style={styles.sectionLabel}>DETALLE DE ÍTEMS REQUERIDOS</Text>
        <View style={{ border: `1 solid ${BORDER}` }}>
          <View style={styles.tableHead}>
            {([
              ['ITEM #',COL.num],['TIPO',COL.tipo],['CÓDIGO',COL.cod],
              ['DESCRIPCIÓN DEL BIEN O SERVICIO',COL.desc],['UNIDAD',COL.und],
              ['QTY SOLIC.',COL.qty],['INFORMACIÓN ADICIONAL',COL.info],
              ['P. UNIT. (USD)',COL.pu],['TOTAL (USD)',COL.tot],['FECHA ENTREGA',COL.fecha],
            ] as [string, string][]).map(([lbl, w]) => (
              <Text key={lbl} style={{ ...styles.thCell, width: w }}>{lbl}</Text>
            ))}
          </View>
          {items.map((it: any, i: number) => (
            <View key={it.linea} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tdCell, width: COL.num }}>{it.linea}</Text>
              <Text style={{ ...styles.tdCell, width: COL.tipo }}>{it.tipo ?? ''}</Text>
              <Text style={{ ...styles.tdCell, width: COL.cod, fontSize: 6 }}>{it.codigo ?? ''}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.desc }}>{it.descripcion}</Text>
              <Text style={{ ...styles.tdCell, width: COL.und }}>{it.unidad}</Text>
              <Text style={{ ...styles.tdCell, width: COL.qty }}>{it.cantidad}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.info, fontSize: 6 }}>{it.informacion_adicional ?? ''}</Text>
              <Text style={{ ...styles.tdCell, width: COL.pu }}>{usd(Number(it.precio_unitario))}</Text>
              <Text style={{ ...styles.tdCell, width: COL.tot }}>{usd(Number(it.cantidad) * Number(it.precio_unitario))}</Text>
              <Text style={{ ...styles.tdCell, width: COL.fecha, fontSize: 6 }}>{fmtDate(it.fecha_entrega)}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={{ border: `1 solid ${BORDER}`, borderTop: 0 }}>
          {([
            ['VALOR TOTAL DEL REQUERIMIENTO (USD) — sin IVA:', usd(subtotal)],
            ['IVA 15%:', usd(iva)],
            ['VALOR TOTAL CON IVA 15%:', usd(total)],
          ] as [string, string][]).map(([lbl, val]) => (
            <View key={lbl} style={styles.totalRow}>
              <Text style={styles.totalLabel}>{lbl}</Text>
              <Text style={styles.totalVal}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Condiciones mínimas */}
        <Text style={{ ...styles.sectionLabel, marginTop: 6 }}>
          CONDICIONES MÍNIMAS PARA PROVEEDORES (certificaciones, normas, fichas técnicas, etc.)
        </Text>
        <View style={styles.condBox}>
          <Text style={styles.condHint}>
            Indique condiciones: certificaciones (API, ASTM, ISO, CE, UL), fichas técnicas, muestras, garantías mínimas, normas SSO, etc.
          </Text>
          <Text style={styles.condText}>{oc.condiciones_minimas ?? ''}</Text>
        </View>

        {/* Aprobaciones */}
        <Text style={styles.sectionLabel}>APROBACIONES</Text>
        <View style={styles.aprobRow}>
          <View style={styles.aprobCell}>
            <Text style={styles.aprobHead}>ELABORADO POR</Text>
            <Text style={styles.aprobName}>{oc.creado_por_nombre ?? ''}</Text>
            <Text style={styles.aprobCargo}>{creadorCargo}</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
          <View style={styles.aprobCell}>
            <Text style={styles.aprobHead}>APROBADO POR{'\n'}COORDINADOR DEL ÁREA</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
          <View style={styles.aprobCell}>
            <Text style={styles.aprobHead}>APROBADO POR{'\n'}COORDINADOR DE COMPRAS/GERENTE GENERAL</Text>
            <Text style={styles.aprobName}>{oc.aprobado_por_nombre ?? ''}</Text>
            <Text style={styles.aprobCargo}>Coordinador de Compras / Gerente General</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
          <View style={styles.aprobCellLast}>
            <Text style={styles.aprobHead}>RECIBIDO Y CONFIRMADO (PROVEEDOR)</Text>
            <Text style={styles.aprobFirma}>Firma / Fecha: _______________</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
