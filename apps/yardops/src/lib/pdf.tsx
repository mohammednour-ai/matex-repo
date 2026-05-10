import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    backgroundColor: "#ffffff",
    color: "#1a1a1a",
  },
  header: {
    borderBottom: "2px solid #1a1a1a",
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#555555" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, color: "#666666", marginBottom: 6, borderBottom: "1px solid #dddddd", paddingBottom: 3 },
  label: { color: "#666666" },
  value: { fontWeight: "bold" },
  lineRow: { flexDirection: "row", borderBottom: "1px solid #eeeeee", paddingVertical: 4 },
  lineCol1: { flex: 2 },
  lineCol2: { flex: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLine: { borderTop: "1px solid #cccccc", marginTop: 6, paddingTop: 6 },
  grandTotal: { fontSize: 14, fontWeight: "bold" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTop: "1px solid #dddddd", paddingTop: 10, fontSize: 8, color: "#888888", textAlign: "center" },
  badge: { backgroundColor: "#f0f0f0", padding: "2 6", borderRadius: 3, fontSize: 8 },
  sigBox: { border: "1px solid #cccccc", height: 60, marginTop: 8, borderRadius: 4 },
  compliance: { fontSize: 8, color: "#888888", marginTop: 16 },
});

export type TicketPDFData = {
  ticket_number: string;
  ticket_id: string;
  yard_name: string;
  yard_address: string;
  hst_number: string;
  license_number: string;
  seller_name: string;
  seller_phone: string;
  date: string;
  time: string;
  gross_kg: number;
  tare_kg: number;
  net_kg: number;
  lines: Array<{
    material_name: string;
    category: string;
    qty_kg: number;
    price_per_kg: number;
    line_total: number;
  }>;
  subtotal: number;
  hst_amount: number;
  total: number;
  payout_method: string;
  payout_ref?: string;
  signature_included: boolean;
};

export function TicketPDF({ data }: { data: TicketPDFData }) {
  return (
    <Document title={`Ticket ${data.ticket_number}`} author={data.yard_name}>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.row}>
            <View>
              <Text style={styles.title}>{data.yard_name}</Text>
              <Text style={styles.subtitle}>{data.yard_address}</Text>
              <Text style={styles.subtitle}>HST: {data.hst_number} · Licence: {data.license_number}</Text>
            </View>
            <View style={{ textAlign: "right" }}>
              <Text style={{ fontSize: 16, fontWeight: "bold" }}>TICKET</Text>
              <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1a1a1a" }}>{data.ticket_number}</Text>
              <Text style={styles.label}>{data.date} {data.time}</Text>
            </View>
          </View>
        </View>

        {/* Seller + Weight */}
        <View style={[styles.section, { flexDirection: "row", gap: 20 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Seller</Text>
            <Text style={styles.value}>{data.seller_name}</Text>
            <Text style={styles.label}>{data.seller_phone}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Weight Summary</Text>
            <View style={styles.totalRow}>
              <Text style={styles.label}>Gross</Text>
              <Text>{data.gross_kg.toFixed(2)} kg</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.label}>Tare</Text>
              <Text>{data.tare_kg.toFixed(2)} kg</Text>
            </View>
            <View style={[styles.totalRow, styles.totalLine]}>
              <Text style={styles.value}>Net</Text>
              <Text style={styles.value}>{data.net_kg.toFixed(2)} kg</Text>
            </View>
          </View>
        </View>

        {/* Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Materials</Text>
          <View style={[styles.lineRow, { borderBottom: "1.5px solid #cccccc" }]}>
            <Text style={[styles.lineCol1, styles.label]}>Material</Text>
            <Text style={[styles.lineCol2, styles.label]}>Weight</Text>
            <Text style={[styles.lineCol2, styles.label]}>Rate</Text>
            <Text style={[styles.lineCol2, styles.label]}>Total</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineCol1}>{l.material_name}</Text>
              <Text style={styles.lineCol2}>{l.qty_kg.toFixed(2)} kg</Text>
              <Text style={styles.lineCol2}>${l.price_per_kg.toFixed(3)}/kg</Text>
              <Text style={[styles.lineCol2, styles.value]}>${l.line_total.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={[styles.section, { alignSelf: "flex-end", width: 200 }]}>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Subtotal</Text>
            <Text>${data.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>HST 13%</Text>
            <Text>${data.hst_amount.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalLine]}>
            <Text style={styles.grandTotal}>Total Payout</Text>
            <Text style={styles.grandTotal}>${data.total.toFixed(2)} CAD</Text>
          </View>
          <View style={[styles.totalRow, { marginTop: 6 }]}>
            <Text style={styles.label}>Method</Text>
            <Text style={styles.badge}>{data.payout_method.replace("_", " ").toUpperCase()}</Text>
          </View>
          {data.payout_ref && (
            <View style={styles.totalRow}>
              <Text style={styles.label}>Reference</Text>
              <Text>{data.payout_ref}</Text>
            </View>
          )}
        </View>

        {/* Signature */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seller Signature</Text>
          {data.signature_included ? (
            <Text style={{ fontSize: 9, color: "#555555" }}>Signature on file — see digital record.</Text>
          ) : (
            <View style={styles.sigBox} />
          )}
          <Text style={{ fontSize: 8, color: "#888888", marginTop: 4 }}>
            By signing, the seller confirms information is accurate and consents to the payout.
          </Text>
        </View>

        {/* Compliance footer */}
        <Text style={styles.compliance}>
          This document is a legally required record under Ontario Municipal Act (R.S.O. 1990, c. M.45) and the Scrap Metal Dealers Act.
          Seller personal information collected under PIPEDA s.4.3 (Principle 3: Consent) for regulatory compliance.
          Retain this record for a minimum of 7 years per CRA requirements. Ticket ID: {data.ticket_id}
        </Text>

        <View style={styles.footer}>
          <Text>{data.yard_name} · {data.yard_address} · HST: {data.hst_number}</Text>
          <Text>Ticket {data.ticket_number} · {data.date}</Text>
        </View>
      </Page>
    </Document>
  );
}
