"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callTool, getUser } from "@/lib/api";
import { ArrowLeft, ShieldCheck, ShieldOff, ShieldAlert, FileText } from "lucide-react";

type SellerDetail = {
  seller_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  address?: string;
  pipeda_consent: boolean;
  pipeda_consent_at?: string;
  is_blocked: boolean;
  block_reason?: string;
  created_at: string;
};

type SellerIdRecord = {
  id_record_id: string;
  id_type: string;
  province_issued?: string;
  expiry_date?: string;
  logged_at: string;
  ocr_confidence?: number;
};

type Ticket = {
  ticket_id: string;
  ticket_number: string;
  status: string;
  created_at: string;
  subtotal?: number;
};

export default function SellerDetailPage() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const router = useRouter();
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";

  const [seller, setSeller] = useState<SellerDetail | null>(null);
  const [ids, setIds] = useState<SellerIdRecord[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      callTool<{ seller: SellerDetail }>("yardops.get_seller", { tenant_id: tenantId, seller_id: sellerId }),
      callTool<{ id_records: SellerIdRecord[] }>("yardops.list_seller_ids", { tenant_id: tenantId, seller_id: sellerId }),
      callTool<{ tickets: Ticket[] }>("yardops.list_tickets", { tenant_id: tenantId, seller_id: sellerId, limit: 20 }),
    ]).then(([sRes, idRes, tRes]) => {
      if (sRes.success && sRes.data) setSeller(sRes.data.seller);
      if (idRes.success && idRes.data) setIds(idRes.data.id_records ?? []);
      if (tRes.success && tRes.data) setTickets(tRes.data.tickets ?? []);
    }).finally(() => setLoading(false));
  }, [sellerId, tenantId]);

  async function toggleBlock() {
    if (!seller) return;
    setBlocking(true);
    setError("");
    const tool = seller.is_blocked ? "yardops.unblock_seller" : "yardops.block_seller";
    const res = await callTool(tool, {
      tenant_id: tenantId,
      actor_id: actorId,
      seller_id: sellerId,
      reason: seller.is_blocked ? undefined : "Manual block by operator",
    });
    if (res.success) {
      setSeller((s) => s ? { ...s, is_blocked: !s.is_blocked } : s);
    } else {
      setError(res.error?.message ?? "Failed to update seller");
    }
    setBlocking(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-night-800" />
        <div className="h-40 animate-pulse rounded-xl bg-night-800" />
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-12">
        <p className="text-night-400">Seller not found.</p>
        <button onClick={() => router.back()} className="mt-4 yard-btn-secondary">Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="yard-btn-secondary p-2" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-night-100">{seller.first_name} {seller.last_name}</h1>
          <p className="text-sm text-night-400">{seller.phone}</p>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {seller.pipeda_consent ? (
          <span className="badge-green flex items-center gap-1.5">
            <ShieldCheck size={13} /> PIPEDA Consent on File
          </span>
        ) : (
          <span className="badge-amber flex items-center gap-1.5">
            <ShieldAlert size={13} /> No PIPEDA Consent
          </span>
        )}
        {seller.is_blocked && (
          <span className="badge-red flex items-center gap-1.5">
            <ShieldOff size={13} /> Blocked
          </span>
        )}
      </div>

      {/* Profile card */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-night-500 text-xs">Phone</p>
            <p className="text-night-100 font-medium">{seller.phone}</p>
          </div>
          {seller.email && (
            <div>
              <p className="text-night-500 text-xs">Email</p>
              <p className="text-night-100 font-medium">{seller.email}</p>
            </div>
          )}
          {seller.address && (
            <div className="col-span-2">
              <p className="text-night-500 text-xs">Address</p>
              <p className="text-night-100 font-medium">{seller.address}</p>
            </div>
          )}
          <div>
            <p className="text-night-500 text-xs">Member Since</p>
            <p className="text-night-100 font-medium">{new Date(seller.created_at).toLocaleDateString("en-CA")}</p>
          </div>
          {seller.pipeda_consent_at && (
            <div>
              <p className="text-night-500 text-xs">Consent Recorded</p>
              <p className="text-night-100 font-medium">{new Date(seller.pipeda_consent_at).toLocaleDateString("en-CA")}</p>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

        <button
          onClick={toggleBlock}
          disabled={blocking}
          className={seller.is_blocked ? "yard-btn-secondary" : "yard-btn-danger"}
        >
          {blocking ? "Updating…" : seller.is_blocked ? "Unblock Seller" : "Block Seller"}
        </button>
      </div>

      {/* ID records */}
      <div className="yard-card">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-night-400">Government IDs on File</h2>
        {ids.length === 0 ? (
          <p className="text-sm text-night-500">No ID records.</p>
        ) : (
          <div className="space-y-2">
            {ids.map((id) => (
              <div key={id.id_record_id} className="flex items-center justify-between rounded-xl border border-night-700 bg-night-800/50 px-4 py-3 text-sm">
                <div>
                  <p className="text-night-100 font-medium capitalize">{id.id_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-night-400">
                    {id.province_issued && `Issued: ${id.province_issued} · `}
                    {id.expiry_date && `Expires: ${id.expiry_date} · `}
                    Logged {new Date(id.logged_at).toLocaleDateString("en-CA")}
                  </p>
                </div>
                {id.ocr_confidence != null && id.ocr_confidence > 0 && (
                  <span className="badge-steel text-xs">OCR {Math.round(id.ocr_confidence * 100)}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent tickets */}
      <div className="yard-card">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-night-400">Recent Tickets</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-night-500">No tickets yet.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.ticket_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-night-500" />
                  <p className="font-medium text-night-200">{t.ticket_number}</p>
                  <span className={[
                    "badge-steel capitalize",
                    t.status === "completed" ? "badge-green" : t.status === "voided" ? "badge-red" : "",
                  ].join(" ")}>{t.status}</span>
                </div>
                <div className="text-right">
                  {t.subtotal != null && <p className="text-night-100 font-medium">${t.subtotal.toFixed(2)}</p>}
                  <p className="text-xs text-night-500">{new Date(t.created_at).toLocaleDateString("en-CA")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
