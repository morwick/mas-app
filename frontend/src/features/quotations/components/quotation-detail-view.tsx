import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { QuotationStatusBadge } from "./quotation-status-badge";
import {
  deleteQuotation,
  setQuotationStatus
} from "@/features/quotations/api";
import type {
  Quotation,
  QuotationJobRef,
  QuotationStatus
} from "@/types";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/utils";

interface Props {
  quotation: Quotation;
  /** Nomor WA PIC dari master customer — untuk tombol kirim. */
  picNoHp?: string | null;
  /** Job yang sudah lahir dari penawaran ini. */
  jobs: QuotationJobRef[];
  canDelete: boolean;
}

/** 08xx… / +62… → 62xx… sesuai yang diminta wa.me */
function toWaNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function QuotationDetailView({
  quotation: q,
  picNoHp,
  jobs,
  canDelete
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isLocked = q.status === "deal";

  async function changeStatus(status: QuotationStatus, alasan?: string) {
    setLoading(true);
    const res = await setQuotationStatus(q.id, status, { alasan });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Status penawaran diperbarui");
    setRejectOpen(false);
  }

  async function onDelete() {
    setLoading(true);
    const res = await deleteQuotation(q.id);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Penawaran dihapus");
    navigate("/quotations");
  }

  function waText(): string {
    const lines: string[] = [];
    lines.push(`*Penawaran ${q.quote_number}*`);
    lines.push(`${q.customer_nama}`);
    if (q.pic_nama) lines.push(`Up: ${q.pic_sapaan ?? "Bapak"} ${q.pic_nama}`);
    lines.push("");
    lines.push(
      `Berikut penawaran biaya pengangkutan${q.objek ? ` ${q.objek}` : ""}:`
    );
    lines.push("");
    q.items.forEach((it, i) => {
      lines.push(
        `${i + 1}. ${it.dari} → ${it.tujuan}` +
          `\n   ${it.qty} ${it.satuan}${it.nama_alat ? ` ${it.nama_alat}` : ""}` +
          ` @ ${formatRupiah(it.harga_satuan)} = ${formatRupiah(it.subtotal)}`
      );
    });
    lines.push("");
    if (q.ppn_aktif) {
      lines.push(`Subtotal: ${formatRupiah(q.subtotal)}`);
      lines.push(`PPN ${Number(q.ppn_persen)}%: ${formatRupiah(q.ppn_nominal)}`);
    }
    lines.push(`*TOTAL: ${formatRupiah(q.total)}*`);
    if (q.berlaku_sampai)
      lines.push(`\nBerlaku sampai ${formatDate(q.berlaku_sampai)}.`);
    lines.push("");
    lines.push("Hormat kami,");
    lines.push(`${q.ttd_nama ?? ""} — PT. Mitra Angkutan Sejati`);
    return lines.join("\n");
  }

  function sendWa() {
    const target = picNoHp ? toWaNumber(picNoHp) : "";
    const url = target
      ? `https://wa.me/${target}?text=${encodeURIComponent(waText())}`
      : `https://wa.me/?text=${encodeURIComponent(waText())}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="toolbar">
        <Link
          to="/quotations"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
            textDecoration: "none"
          }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Daftar penawaran
        </Link>
      </div>

      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div>
            <p className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
              {q.quote_number}
            </p>
            <p style={{ fontSize: 14, marginTop: 2 }}>{q.customer_nama}</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              {q.kota_terbit}, {formatDate(q.tanggal)}
              {q.created_by_nama ? ` · dibuat oleh ${q.created_by_nama}` : ""}
            </p>
          </div>
          <QuotationStatusBadge status={q.status} />
        </div>

        {q.status === "kedaluwarsa" && (
          <p
            style={{
              marginTop: 12,
              fontSize: 12.5,
              padding: "8px 10px",
              borderRadius: 6,
              background: "#fdf6e8",
              color: "#8a5a11"
            }}
          >
            Masa berlaku habis {q.berlaku_sampai ? formatDate(q.berlaku_sampai) : "—"}.
            Surat ini masih bisa ditandai Deal bila customer baru menjawab, atau
            perpanjang tanggalnya lewat tombol Ubah.
          </p>
        )}

        {q.status === "ditolak" && q.alasan_ditolak && (
          <p
            style={{
              marginTop: 12,
              fontSize: 12.5,
              padding: "8px 10px",
              borderRadius: 6,
              background: "#fdf1f1",
              color: "#a32b2b"
            }}
          >
            Alasan ditolak: {q.alasan_ditolak}
          </p>
        )}

        {/* Aksi */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border-default)"
          }}
        >
          <Link to={`/quotations/${q.id}/cetak`} target="_blank">
            <Button
              variant="secondary"
              leftIcon={<Printer style={{ width: 15, height: 15 }} />}
            >
              Cetak / PDF
            </Button>
          </Link>

          <Button
            variant="secondary"
            leftIcon={<MessageCircle style={{ width: 15, height: 15 }} />}
            onClick={sendWa}
          >
            Kirim WhatsApp
          </Button>

          {!isLocked && (
            <Link to={`/quotations/${q.id}/edit`}>
              <Button
                variant="secondary"
                leftIcon={<Pencil style={{ width: 15, height: 15 }} />}
              >
                Ubah
              </Button>
            </Link>
          )}

          {q.status === "draft" && (
            <Button
              leftIcon={<Send style={{ width: 15, height: 15 }} />}
              loading={loading}
              onClick={() => changeStatus("terkirim")}
            >
              Tandai terkirim
            </Button>
          )}

          {/* Kedaluwarsa ikut di sini: customer kadang baru menjawab setelah
              masa berlaku lewat, dan memaksa admin membuka ulang surat hanya
              untuk mencatat "deal" itu birokrasi yang tidak perlu. */}
          {(q.status === "terkirim" || q.status === "kedaluwarsa") && (
            <>
              <Button
                leftIcon={<CheckCircle2 style={{ width: 15, height: 15 }} />}
                loading={loading}
                onClick={() => changeStatus("deal")}
              >
                Deal
              </Button>
              <Button
                variant="secondary"
                leftIcon={<XCircle style={{ width: 15, height: 15 }} />}
                onClick={() => setRejectOpen(true)}
              >
                Ditolak
              </Button>
            </>
          )}

          {q.status === "deal" && (
            <Link to={`/jobs/new?quotation=${q.id}`}>
              <Button rightIcon={<ArrowRight style={{ width: 15, height: 15 }} />}>
                {jobs.length > 0 ? "Buat job lagi" : "Buat Job dari penawaran ini"}
              </Button>
            </Link>
          )}

          {q.status === "ditolak" && (
            <Button
              variant="secondary"
              leftIcon={<RotateCcw style={{ width: 15, height: 15 }} />}
              loading={loading}
              onClick={() => changeStatus("draft")}
            >
              Buka kembali
            </Button>
          )}

          <div style={{ flex: 1 }} />

          {canDelete && (
            <Button
              variant="ghost"
              leftIcon={<Trash2 style={{ width: 15, height: 15 }} />}
              onClick={() => setDeleteOpen(true)}
            >
              Hapus
            </Button>
          )}
        </div>
      </div>

      {/* Tujuan surat */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Ditujukan kepada
        </p>
        <InfoRow label="Perusahaan" value={q.customer_nama} />
        <InfoRow label="Kota" value={q.customer_kota ?? "—"} />
        <InfoRow
          label="PIC"
          value={
            q.pic_nama ? `${q.pic_sapaan ?? "Bapak"} ${q.pic_nama}` : "—"
          }
        />
        <InfoRow label="Perihal" value={q.perihal} />
        {q.objek && <InfoRow label="Objek" value={q.objek} />}
        {q.berlaku_sampai && (
          <InfoRow
            label="Berlaku sampai"
            value={formatDate(q.berlaku_sampai)}
          />
        )}
      </div>

      {/* Rincian */}
      <div className="card">
        <div className="card-header">
          <p className="eyebrow">Rincian biaya</p>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>No</th>
                <th>Dari</th>
                <th>Tujuan</th>
                <th style={{ width: 110 }}>Unit</th>
                <th style={{ width: 140, textAlign: "right" }}>@ Price</th>
                <th style={{ width: 140, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, idx) => (
                <tr key={it.id}>
                  <td>{idx + 1}</td>
                  <td>{it.dari}</td>
                  <td>{it.tujuan}</td>
                  <td>
                    {it.qty} {it.satuan}
                    {it.nama_alat && (
                      <div
                        style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}
                      >
                        {it.nama_alat}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatRupiah(it.harga_satuan)}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", fontWeight: 600 }}
                  >
                    {formatRupiah(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="card-pad"
          style={{
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}
        >
          <SumRow label="Subtotal" value={q.subtotal} />
          {q.ppn_aktif && (
            <SumRow
              label={`PPN ${Number(q.ppn_persen)}%`}
              value={q.ppn_nominal}
            />
          )}
          <SumRow label="Total" value={q.total} strong />
        </div>
      </div>

      {/* Job yang lahir dari penawaran ini. Penawaran dengan beberapa rute
          bisa menurunkan lebih dari satu job. */}
      {jobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Job dari penawaran ini</p>
            <span className="caption" style={{ color: "var(--text-tertiary)" }}>
              {jobs.length} dari {q.items.length} rute
            </span>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Nomor job</th>
                  <th>Rute</th>
                  <th style={{ width: 150 }}>Berangkat</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="row-link">
                    <td>
                      <Link
                        to={`/jobs/${j.id}`}
                        className="mono"
                        style={{
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {j.job_number}
                      </Link>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {j.asal} → {j.tujuan}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {formatDateTime(j.etd)}
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {q.catatan && (
        <div className="card card-pad">
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Catatan internal
          </p>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{q.catatan}</p>
          <p className="caption" style={{ color: "var(--text-tertiary)", marginTop: 6 }}>
            Tidak ikut tercetak di surat.
          </p>
        </div>
      )}

      {/* Modal tolak */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Tandai penawaran ditolak"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={loading}
              onClick={() => changeStatus("ditolak", rejectReason)}
            >
              Tandai ditolak
            </Button>
          </>
        }
      >
        <Field
          label="Alasan"
          hint="Berguna sebagai bahan follow-up dan acuan harga rute serupa."
        >
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="mis. harga di atas budget customer, pakai vendor lain"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title="Hapus penawaran ini?"
        body={
          <>
            Penawaran <strong>{q.quote_number}</strong> akan dihapus permanen
            beserta rinciannya. Nomor surat tidak akan dipakai ulang, sehingga
            urutan arsip akan berlubang.
          </>
        }
        confirmText="Hapus"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "5px 0",
        fontSize: 13,
        borderBottom: "1px solid var(--border-subtle, transparent)"
      }}
    >
      <span style={{ width: 130, color: "var(--text-tertiary)", flexShrink: 0 }}>
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function SumRow({
  label,
  value,
  strong
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: strong ? 15 : 13,
        fontWeight: strong ? 700 : 400,
        color: strong ? "var(--text-primary)" : "var(--text-secondary)"
      }}
    >
      <span>{label}</span>
      <span className="mono">{formatRupiah(value)}</span>
    </div>
  );
}
