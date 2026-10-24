import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// Spec: HU-021 CA-11 — mismo patrón visual de lib/oc-pdf.tsx / lib/np-pdf.tsx.
const ROJO_OSC = '#7f1d1d'
const ROJO     = '#991b1b'
const GRIS     = '#64748b'
const BORDER   = '#cbd5e1'

const styles = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 8, padding: 20, paddingBottom: 26, color: '#1e293b' },
  headerRow:   {
    flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingBottom: 4,
    borderBottomWidth: 2, borderBottomColor: ROJO_OSC, borderBottomStyle: 'solid',
  },
  logo:        { width: 60, height: 30, objectFit: 'contain' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Helvetica-Bold', color: ROJO_OSC },
  headerNum:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: ROJO, textAlign: 'right', minWidth: 90 },
  pageFooter:  { position: 'absolute', bottom: 10, right: 20, fontSize: 6, color: GRIS },
  sectionLabel: {
    backgroundColor: ROJO_OSC, color: 'white', fontSize: 7,
    fontFamily: 'Helvetica-Bold', padding: '2 6', marginBottom: 0,
  },
  twoCol:   { flexDirection: 'row', marginBottom: 6, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid' },
  col:      { flex: 1, padding: 5 },
  colRight: { flex: 1, padding: 5, borderLeftWidth: 1, borderLeftColor: BORDER, borderLeftStyle: 'solid' },
  rowKV:    { flexDirection: 'row', marginBottom: 2 },
  kvLabel:  { fontSize: 7, color: GRIS, width: 70 },
  kvVal:    { fontSize: 7, flex: 1 },
  tableHead:   { flexDirection: 'row', backgroundColor: ROJO_OSC, padding: '3 0' },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid', minHeight: 18 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid', minHeight: 18, backgroundColor: '#fff5f5' },
  thCell:      { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 2 },
  tdCell:      { fontSize: 7, textAlign: 'center', paddingHorizontal: 2, paddingVertical: 3 },
  tdLeft:      { fontSize: 7, textAlign: 'left', paddingHorizontal: 3, paddingVertical: 3 },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', padding: '2 6', borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid' },
  totalLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', marginRight: 12 },
  totalVal:    { fontSize: 7, fontFamily: 'Helvetica-Bold', width: 70, textAlign: 'right' },
  aprobRow:      { flexDirection: 'row', borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginTop: 6 },
  aprobCell:     { flex: 1, borderRightWidth: 1, borderRightColor: BORDER, borderRightStyle: 'solid', padding: 5, minHeight: 78 },
  aprobCellLast: { flex: 1, padding: 5, minHeight: 78 },
  aprobHead:     { backgroundColor: ROJO, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 6, padding: '2 4', textAlign: 'center', marginBottom: 4 },
  filaFirmante:      { flexDirection: 'row', marginTop: 3 },
  filaFirmanteLabel: { fontSize: 6, color: GRIS, width: 48 },
  filaFirmanteValor: { fontSize: 7, flex: 1 },
  filaFirma:         { flexDirection: 'row', marginTop: 10 },
})

function usd(n: number) { return `$${Number(n).toFixed(2)}` }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function FilaFirmante({ label, value, esFirma }: { label: string; value: string; esFirma?: boolean }) {
  return (
    <View style={esFirma ? styles.filaFirma : styles.filaFirmante}>
      <Text style={styles.filaFirmanteLabel}>{label}:</Text>
      <Text style={styles.filaFirmanteValor}>{value}</Text>
    </View>
  )
}

const COL = { cod: '14%', desc: '38%', und: '10%', qty: '12%', pu: '13%', tot: '13%' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OcaReleaseDocument({ release, items, oca, proveedorNombre, areaNombre, solicitanteNombre, aprobadorNombre, logoUrl }: {
  release: any; items: any[]; oca: any
  proveedorNombre: string; areaNombre: string; solicitanteNombre: string; aprobadorNombre: string
  logoUrl: string
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        <View style={styles.headerRow}>
          {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : <View style={styles.logo} />}
          <Text style={styles.headerTitle}>RELEASE DE ORDEN DE COMPRA ABIERTA</Text>
          <Text style={styles.headerNum}>No. {release.numero_release}</Text>
        </View>

        <Text style={styles.sectionLabel}>INFORMACIÓN GENERAL</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            {([
              ['OCA DE ORIGEN', oca.numero_oca],
              ['PROVEEDOR', proveedorNombre],
              ['CENTRO DE COSTO', areaNombre],
            ] as [string, string][]).map(([k, v]) => (
              <View key={k} style={styles.rowKV}>
                <Text style={styles.kvLabel}>{k}</Text>
                <Text style={styles.kvVal}>{v ?? '—'}</Text>
              </View>
            ))}
          </View>
          <View style={styles.colRight}>
            {([
              ['SOLICITANTE', solicitanteNombre],
              ['FECHA', fmtDate(release.created_at)],
              ['OBSERVACIONES', release.observaciones],
            ] as [string, string][]).map(([k, v]) => (
              <View key={k} style={styles.rowKV}>
                <Text style={styles.kvLabel}>{k}</Text>
                <Text style={styles.kvVal}>{v ?? '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>ÍTEMS SOLICITADOS</Text>
        <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'solid' }}>
          <View style={styles.tableHead}>
            {([
              ['CÓDIGO', COL.cod], ['DESCRIPCIÓN', COL.desc], ['UNIDAD', COL.und],
              ['CANTIDAD', COL.qty], ['P. UNIT. (USD)', COL.pu], ['SUBTOTAL (USD)', COL.tot],
            ] as [string, string][]).map(([lbl, w]) => (
              <Text key={lbl} style={{ ...styles.thCell, width: w }}>{lbl}</Text>
            ))}
          </View>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {items.map((it: any, i: number) => (
            <View key={it.id ?? i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tdCell, width: COL.cod, fontSize: 6 }}>{it.codigo}</Text>
              <Text style={{ ...styles.tdLeft, width: COL.desc }}>{it.descripcion}</Text>
              <Text style={{ ...styles.tdCell, width: COL.und }}>{it.unidad}</Text>
              <Text style={{ ...styles.tdCell, width: COL.qty }}>{it.cantidad}</Text>
              <Text style={{ ...styles.tdCell, width: COL.pu }}>{usd(Number(it.precio_unitario))}</Text>
              <Text style={{ ...styles.tdCell, width: COL.tot }}>{usd(Number(it.subtotal))}</Text>
            </View>
          ))}
        </View>

        <View style={{ borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', borderTopWidth: 0 }}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>MONTO TOTAL DEL RELEASE (USD):</Text>
            <Text style={styles.totalVal}>{usd(Number(release.monto_total))}</Text>
          </View>
        </View>

        {/* Spec: HU-021 CA-11 — solo texto (nombre + fecha), sin firma digital/imagen */}
        <Text style={styles.sectionLabel}>APROBACIONES</Text>
        <View style={styles.aprobRow}>
          <View style={styles.aprobCell}>
            <Text style={styles.aprobHead}>GENERADO POR</Text>
            <FilaFirmante label="Nombre" value={solicitanteNombre} />
            <FilaFirmante label="Fecha" value={fmtDate(release.created_at)} />
            <FilaFirmante label="Firma" value="" esFirma />
          </View>
          <View style={styles.aprobCellLast}>
            <Text style={styles.aprobHead}>APROBADO POR</Text>
            <FilaFirmante label="Nombre" value={aprobadorNombre} />
            <FilaFirmante label="Fecha" value={fmtDate(release.resuelto_en)} />
            <FilaFirmante label="Firma" value="" esFirma />
          </View>
        </View>

        <Text style={styles.pageFooter} fixed>
          {release.numero_release}
        </Text>

      </Page>
    </Document>
  )
}
