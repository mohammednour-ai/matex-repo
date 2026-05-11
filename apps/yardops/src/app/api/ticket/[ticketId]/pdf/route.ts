import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { TicketPDF, type TicketPDFData } from "@/lib/pdf";

const GATEWAY = process.env.MCP_GATEWAY_URL ?? "http://localhost:3001";

async function callGatewayTool<T>(tool: string, args: Record<string, unknown>, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${GATEWAY}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool, args }),
    });
    const json = await res.json() as { success?: boolean; data?: T };
    return json.success && json.data ? json.data : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const { ticketId } = params;
  const token = req.cookies.get("matex_yardops_session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  type TicketRaw = {
    ticket_id: string;
    ticket_number: string;
    seller_first_name: string;
    seller_last_name: string;
    seller_phone: string;
    gross_weight_kg: number;
    tare_weight_kg: number;
    signature_svg?: string;
    created_at: string;
    lines: Array<{ material_name: string; category: string; quantity_kg: number; unit_price_per_kg: number; line_total: number }>;
    payout?: { method: string; etransfer_email?: string; cheque_number?: string; subtotal: number; hst_collected: number; total: number };
    tenant?: { yard_name: string; address: string; hst_number: string; license_number: string };
  };

  const ticket = await callGatewayTool<TicketRaw>("yardops.get_ticket", { ticket_id: ticketId }, token);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const created = new Date(ticket.created_at);
  const net = ticket.gross_weight_kg - ticket.tare_weight_kg;
  const payout = ticket.payout;
  const tenant = ticket.tenant;

  const data: TicketPDFData = {
    ticket_id: ticket.ticket_id,
    ticket_number: ticket.ticket_number,
    yard_name: tenant?.yard_name ?? "Scrap Yard",
    yard_address: tenant?.address ?? "",
    hst_number: tenant?.hst_number ?? "",
    license_number: tenant?.license_number ?? "",
    seller_name: `${ticket.seller_first_name} ${ticket.seller_last_name}`,
    seller_phone: ticket.seller_phone,
    date: created.toLocaleDateString("en-CA"),
    time: created.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }),
    gross_kg: ticket.gross_weight_kg,
    tare_kg: ticket.tare_weight_kg,
    net_kg: net,
    lines: (ticket.lines ?? []).map((l) => ({
      material_name: l.material_name,
      category: l.category,
      qty_kg: l.quantity_kg,
      price_per_kg: l.unit_price_per_kg,
      line_total: l.line_total,
    })),
    subtotal: payout?.subtotal ?? 0,
    hst_amount: payout?.hst_collected ?? 0,
    total: payout?.total ?? 0,
    payout_method: payout?.method ?? "unknown",
    payout_ref: payout?.etransfer_email ?? payout?.cheque_number,
    signature_included: !!ticket.signature_svg,
  };

  try {
    const buffer = await renderToBuffer(React.createElement(TicketPDF, { data }));
    return new NextResponse(buffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="ticket-${ticket.ticket_number}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[PDF] render error", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
