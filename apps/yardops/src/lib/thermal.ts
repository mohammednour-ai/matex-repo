// ESC/POS formatting for Star TSP / Epson TM-T88
// Produces a Uint8Array of bytes to send over Web Serial or BLE to the printer

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const CR = 0x0d;

function textBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function center(text: string, width = 48): string {
  const padded = text.slice(0, width);
  const spaces = Math.max(0, Math.floor((width - padded.length) / 2));
  return " ".repeat(spaces) + padded;
}

function line(width = 48): string {
  return "-".repeat(width);
}

function row(left: string, right: string, width = 48): string {
  const maxLeft = width - right.length - 1;
  const l = left.slice(0, maxLeft).padEnd(maxLeft);
  return l + " " + right;
}

type TicketData = {
  ticket_number: string;
  yard_name: string;
  yard_address: string;
  hst_number: string;
  seller_name: string;
  date: string;
  time: string;
  gross_kg: number;
  tare_kg: number;
  net_kg: number;
  lines: Array<{ name: string; qty_kg: number; price_per_kg: number; total: number }>;
  subtotal: number;
  hst: number;
  total: number;
  payout_method: string;
};

export function buildEscPosReceipt(ticket: TicketData): Uint8Array {
  const cmds: number[] = [];

  const push = (...bytes: number[]) => cmds.push(...bytes);
  const text = (s: string) => cmds.push(...textBytes(s));
  const nl = () => push(LF);

  // Init printer
  push(ESC, 0x40); // ESC @ — initialize

  // Bold on
  const boldOn = () => push(ESC, 0x45, 1);
  const boldOff = () => push(ESC, 0x45, 0);
  // Align center
  const alignCenter = () => push(ESC, 0x61, 1);
  // Align left
  const alignLeft = () => push(ESC, 0x61, 0);
  // Double height+width
  const bigText = () => push(GS, 0x21, 0x11);
  const normalText = () => push(GS, 0x21, 0x00);

  // Header
  alignCenter();
  bigText();
  boldOn();
  text(ticket.yard_name);
  nl();
  normalText();
  boldOff();
  text(ticket.yard_address);
  nl();
  text(`HST: ${ticket.hst_number}`);
  nl();
  text(line());
  nl();

  // Ticket info
  alignLeft();
  boldOn();
  text(`TICKET: ${ticket.ticket_number}`);
  nl();
  boldOff();
  text(row("Seller:", ticket.seller_name));
  nl();
  text(row("Date:", ticket.date));
  nl();
  text(row("Time:", ticket.time));
  nl();
  text(line());
  nl();

  // Weight summary
  text(row("Gross Weight:", `${ticket.gross_kg.toFixed(2)} kg`));
  nl();
  text(row("Tare Weight:", `${ticket.tare_kg.toFixed(2)} kg`));
  nl();
  boldOn();
  text(row("Net Weight:", `${ticket.net_kg.toFixed(2)} kg`));
  nl();
  boldOff();
  text(line());
  nl();

  // Line items
  text("MATERIALS");
  nl();
  for (const l of ticket.lines) {
    text(l.name.slice(0, 32));
    nl();
    text(`  ${l.qty_kg.toFixed(2)}kg x $${l.price_per_kg.toFixed(3)} = $${l.total.toFixed(2)}`);
    nl();
  }
  text(line());
  nl();

  // Totals
  text(row("Subtotal:", `$${ticket.subtotal.toFixed(2)}`));
  nl();
  text(row("HST 13%:", `$${ticket.hst.toFixed(2)}`));
  nl();
  boldOn();
  bigText();
  text(row("TOTAL:", `$${ticket.total.toFixed(2)}`));
  nl();
  normalText();
  boldOff();
  text(row("Method:", ticket.payout_method.replace("_", " ").toUpperCase()));
  nl();
  text(line());
  nl();

  // Footer
  alignCenter();
  text("Seller signature on file.");
  nl();
  text(`Ontario Scrap Metal Dealer — Ticket valid 7 years`);
  nl();
  nl();
  nl();

  // Full cut
  push(GS, 0x56, 0x41, 0x10);

  return new Uint8Array(cmds);
}

// Send ESC/POS buffer to a Web Serial port
export async function printToSerial(port: SerialPort, data: Uint8Array): Promise<void> {
  const writer = port.writable!.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}
