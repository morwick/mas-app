import { Link, useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import { InvoiceStatusBadge, StatusBayarBadge } from "@/features/invoices/components/invoice-status-badge";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import type { Job, StatusBayar } from "@/types";
import { formatRupiah } from "@/lib/utils";

/**
 * Tagihan sebuah job — supaya admin bisa mengingatkan finance di luar sistem.
 * - Superadmin, admin & finance: status tagihan, status bayar & sisa.
 * - Nomor bisa diklik ke tagihan hanya untuk superadmin & finance (admin tidak
 *   punya akses menu Tagihan — nomornya berupa teks).
 * - Operator: backend tidak mengirim info tagihan → tidak tampil apa pun.
 * `ringkas` untuk daftar job.
 */
export function TagihanJobInfo({ job, ringkas = false }: { job: Job; ringkas?: boolean }) {
  const navigate = useNavigate();
  const role = useCurrentUser().role;
  // Status tagihan & nominal sisa: superadmin, admin, finance.
  const lengkap = role === "superadmin" || role === "admin" || role === "finance";
  // Nomor bisa diklik ke halaman tagihan hanya bila punya akses menu Tagihan.
  const bisaBuka = role === "superadmin" || role === "finance";

  if (!job.invoice_id || !job.invoice_number) {
    // info_tagihan false = backend tidak mengirim info tagihan (operator).
    // Kosongan (proyek tanpa customer) tidak pernah ditagih — tanpa status tagihan.
    if (job.status !== "selesai" || !job.info_tagihan || !job.customer_id) return null;
    return (
      <div className="caption" style={ringkas ? { marginTop: 4 } : { marginBottom: 8 }}>
        Belum ditagihkan
      </div>
    );
  }
  const statusBayar = (job.invoice_status_bayar ?? "unpaid") as StatusBayar;
  const keTagihan = `/invoices/${job.invoice_id}`;

  if (ringkas) {
    return (
      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <StatusBayarBadge status={statusBayar} />
        {bisaBuka ? (
          // Tombol, bukan <a>: kartu mobile sendiri sudah berupa tautan.
          <button
            type="button"
            className="caption mono"
            title="Buka tagihan"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(keTagihan);
            }}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
          >
            {job.invoice_number}
          </button>
        ) : (
          <span className="caption mono">{job.invoice_number}</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      <Receipt style={{ width: 14, height: 14, color: "var(--text-tertiary)" }} />
      <span className="caption">Tagihan</span>
      {bisaBuka ? (
        <Link
          to={keTagihan}
          className="mono"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-primary-dark)" }}
          title="Buka tagihan"
        >
          {job.invoice_number}
        </Link>
      ) : (
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
          {job.invoice_number}
        </span>
      )}
      {lengkap && job.invoice_status_tampil && (
        <InvoiceStatusBadge
          status={job.invoice_status_tampil}
          hariTerlambat={job.invoice_hari_terlambat}
        />
      )}
      <StatusBayarBadge status={statusBayar} />
      {lengkap && statusBayar !== "completed" && job.invoice_sisa != null && (
        <span className="caption">Sisa {formatRupiah(job.invoice_sisa)}</span>
      )}
    </div>
  );
}
