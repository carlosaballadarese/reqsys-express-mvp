import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { formatNumeroGuia, MOTIVOS_GUIA } from '@/lib/bodega-guia'

// Spec: HU-042 CA-14/CA-15 — PDF fiel al formato "Formato GR 1701-2000.xlsx": encabezado
// fijo (datos de configuracion_empresa), traslado, motivo con casillas, destinatario /
// transportista, tabla de ítems, comentarios y tres bloques de firma.

const BORDER = '#1e293b'
const GRIS = '#475569'

const styles = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', fontSize: 8, padding: 24, color: '#0f172a' },
  header:    { flexDirection: 'row', marginBottom: 6 },
  hLeft:     { flex: 1.3, paddingRight: 8 },
  hRight:    { flex: 1, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', padding: 6 },
  logo:      { width: 90, height: 38, objectFit: 'contain', marginBottom: 4 },
  small:     { fontSize: 7, marginBottom: 1 },
  ruc:       { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  titulo:    { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 3 },
  numero:    { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 3 },
  box:       { borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', padding: 5, marginBottom: 5 },
  row:       { flexDirection: 'row', marginBottom: 3 },
  lbl:       { fontFamily: 'Helvetica-Bold', fontSize: 7, marginRight: 4 },
  val:       { fontSize: 8, flex: 1 },
  motivoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  motivoItem:{ flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  casilla:   { width: 11, height: 11, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', marginLeft: 3, alignItems: 'center', justifyContent: 'center' },
  casillaX:  { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  dosCol:    { flexDirection: 'row', marginBottom: 5 },
  col:       { flex: 1, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', padding: 5 },
  colGap:    { marginLeft: 5 },
  colTitle:  { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  thead:     { flexDirection: 'row', backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: BORDER, borderStyle: 'solid' },
  trow:      { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, borderStyle: 'solid', minHeight: 15 },
  th:        { fontSize: 7, fontFamily: 'Helvetica-Bold', padding: 3, textAlign: 'center' },
  td:        { fontSize: 7.5, padding: 3 },
  firmas:    { flexDirection: 'row', marginTop: 8 },
  firma:     { flex: 1, borderWidth: 1, borderColor: BORDER, borderStyle: 'solid', padding: 5, minHeight: 90 },
  firmaTit:  { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 14 },
  firmaLinea:{ borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: 'solid', marginTop: 16, marginBottom: 4 },
})

const W = { linea: '8%', codigo: '17%', descripcion: '51%', unidad: '10%', cantidad: '14%' }

const MOTIVO_LABEL: Record<string, string> = {
  venta: 'Venta', renta: 'Renta', devolucion: 'Devolución', consignacion: 'Consignación', otros: 'Otros',
}

function fmtFecha(f?: string | null): string {
  if (!f) return ''
  const [y, m, d] = f.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

type Empresa = {
  razon_social?: string | null; ruc?: string | null; direccion?: string | null; telefono?: string | null
  email?: string | null; guia_autorizacion_sri?: string | null; guia_leyenda_agente_retencion?: string | null
  guia_obligado_contabilidad?: boolean | null; guia_documento_categorizado?: string | null
}
type GuiaPdf = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type ItemPdf = { linea: number; codigo: string; descripcion: string; unidad: string; cantidad: number }

export function GuiaRemisionDocument({
  guia, items, empresa, logoUrl,
}: { guia: GuiaPdf; items: ItemPdf[]; empresa: Empresa; logoUrl?: string }) {
  const empresaCorta = (empresa.razon_social ?? '').split(' ')[0] || 'la empresa'
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.hLeft}>
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <Text style={styles.small}>Dir: {empresa.direccion ?? ''}</Text>
            <Text style={styles.small}>Telf: {empresa.telefono ?? ''}</Text>
            <Text style={styles.small}>E-mail: {empresa.email ?? ''}</Text>
            <Text style={styles.small}>Documento Categorizado: {empresa.guia_documento_categorizado ?? 'NO'}</Text>
            <Text style={styles.small}>Obligado a llevar Contabilidad: {empresa.guia_obligado_contabilidad === false ? 'NO' : 'SI'}</Text>
            {empresa.guia_leyenda_agente_retencion ? <Text style={styles.small}>{empresa.guia_leyenda_agente_retencion}</Text> : null}
          </View>
          <View style={styles.hRight}>
            <Text style={styles.ruc}>RUC: {empresa.ruc ?? ''}      {guia.serie}</Text>
            <Text style={styles.titulo}>GUÍA DE REMISIÓN</Text>
            <Text style={styles.numero}>N° {formatNumeroGuia(guia.numero)}</Text>
            {empresa.guia_autorizacion_sri ? <Text style={styles.small}>Aut. SRI: {empresa.guia_autorizacion_sri}</Text> : null}
            {guia.estado === 'anulada' ? <Text style={[styles.small, { color: '#b91c1c', fontFamily: 'Helvetica-Bold' }]}>*** ANULADA ***</Text> : null}
          </View>
        </View>

        <View style={styles.box}>
          <View style={styles.row}>
            <Text style={styles.lbl}>Fecha Inicio Traslado:</Text><Text style={styles.val}>{fmtFecha(guia.fecha_inicio_traslado)}</Text>
            <Text style={styles.lbl}>Fecha Terminación Traslado:</Text><Text style={styles.val}>{fmtFecha(guia.fecha_fin_traslado)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lbl}>Punto de Partida:</Text><Text style={styles.val}>{guia.punto_partida}</Text>
            <Text style={styles.lbl}>Número de Referencia:</Text><Text style={styles.val}>{guia.numero_referencia ?? ''}</Text>
          </View>
          <View style={styles.motivoRow}>
            <Text style={styles.lbl}>Motivo de Traslado:</Text>
            {MOTIVOS_GUIA.map((m) => (
              <View key={m} style={styles.motivoItem}>
                <Text style={{ fontSize: 7.5 }}>{MOTIVO_LABEL[m]}:</Text>
                <View style={styles.casilla}><Text style={styles.casillaX}>{guia.motivo === m ? 'X' : ''}</Text></View>
              </View>
            ))}
          </View>
          {guia.motivo === 'otros' && guia.motivo_otros ? <Text style={styles.small}>Otros: {guia.motivo_otros}</Text> : null}
        </View>

        <View style={styles.dosCol}>
          <View style={styles.col}>
            <Text style={styles.colTitle}>DESTINATARIO:</Text>
            <View style={styles.row}><Text style={styles.lbl}>Nombre / Razón Social:</Text><Text style={styles.val}>{guia.destinatario_nombre}</Text></View>
            <View style={styles.row}><Text style={styles.lbl}>R.U.C / C.I:</Text><Text style={styles.val}>{guia.destinatario_ruc ?? ''}</Text></View>
            <View style={styles.row}><Text style={styles.lbl}>Punto de Llegada:</Text><Text style={styles.val}>{guia.punto_llegada}</Text></View>
          </View>
          <View style={[styles.col, styles.colGap]}>
            <Text style={styles.colTitle}>TRANSPORTISTA:</Text>
            <View style={styles.row}><Text style={styles.lbl}>Nombre / Razón Social:</Text><Text style={styles.val}>{guia.transportista_nombre}</Text></View>
            <View style={styles.row}><Text style={styles.lbl}>R.U.C / C.I:</Text><Text style={styles.val}>{guia.transportista_identificacion}</Text></View>
            <View style={styles.row}><Text style={styles.lbl}>Placa del Vehículo:</Text><Text style={styles.val}>{guia.placa}</Text></View>
          </View>
        </View>

        <View style={styles.thead}>
          <Text style={[styles.th, { width: W.linea }]}>N° Línea</Text>
          <Text style={[styles.th, { width: W.codigo }]}>N° Parte / Serie</Text>
          <Text style={[styles.th, { width: W.descripcion }]}>Descripción</Text>
          <Text style={[styles.th, { width: W.unidad }]}>Unidad</Text>
          <Text style={[styles.th, { width: W.cantidad }]}>Cantidad</Text>
        </View>
        {items.map((it) => (
          <View key={it.linea} style={styles.trow} wrap={false}>
            <Text style={[styles.td, { width: W.linea, textAlign: 'center' }]}>{it.linea}</Text>
            <Text style={[styles.td, { width: W.codigo }]}>{it.codigo}</Text>
            <Text style={[styles.td, { width: W.descripcion }]}>{it.descripcion}</Text>
            <Text style={[styles.td, { width: W.unidad, textAlign: 'center' }]}>{it.unidad}</Text>
            <Text style={[styles.td, { width: W.cantidad, textAlign: 'right' }]}>{it.cantidad}</Text>
          </View>
        ))}

        <View style={[styles.box, { marginTop: 6, minHeight: 34 }]} wrap={false}>
          <Text style={styles.lbl}>Comentarios:</Text>
          <Text style={styles.val}>{guia.comentarios ?? ''}</Text>
        </View>

        <View style={styles.firmas} wrap={false}>
          <View style={styles.firma}>
            <Text style={styles.firmaTit}>Despachado Por {empresaCorta}:</Text>
            <View style={styles.firmaLinea} />
            <Text style={styles.small}>Firma:</Text>
            <Text style={styles.small}>Nombre: {guia.despachado_por_nombre}</Text>
            <Text style={styles.small}>Fecha: {fmtFecha(guia.fecha_inicio_traslado)}</Text>
          </View>
          <View style={[styles.firma, styles.colGap]}>
            <Text style={styles.firmaTit}>Transportado Por:</Text>
            <View style={styles.firmaLinea} />
            <Text style={styles.small}>Firma:</Text>
            <Text style={styles.small}>Nombre: {guia.transportista_nombre}</Text>
            <Text style={styles.small}>Fecha: {fmtFecha(guia.fecha_inicio_traslado)}</Text>
          </View>
          <View style={[styles.firma, styles.colGap]}>
            <Text style={styles.firmaTit}>Recibido Por:</Text>
            <View style={styles.firmaLinea} />
            <Text style={styles.small}>Firma:</Text>
            <Text style={styles.small}>Nombre:</Text>
            <Text style={styles.small}>Fecha:</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
