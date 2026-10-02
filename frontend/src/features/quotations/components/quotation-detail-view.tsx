import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ListChecks,
  MessageCircle,
  Package,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { QuotationStatusBadge } from "./quotation-status-badge";
import { KeputusanItemModal } from "./keputusan-item-modal";
import { adaRevisi, berlakuSuratAsli, suratRevisi } from "../surat-revisi";
import { CetakRevisiModal } from "./cetak-revisi-modal";
import { ProyekPenawaran } from "./proyek-penawaran";
import {
  deleteQuotation,
  setQuotationStatus
} from "@/features/quotations/api";
import {
  keputusanItemLabel,
  type KeputusanItem,
  type Quotation,
  type QuotationJobRef,
  type QuotationStatus
} from "@/types";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/utils";

interface Props {
  quotation: Quotation;
  /** Nomor WA PIC dari master customer — untuk tombol kirim. */
  picNoHp?: string | null;
  /** Job yang sudah lahir dari penawaran ini. */
  jobs: QuotationJobRef[];
  canDelete: boolean;
  /** Finance: hanya melihat — tanpa tombol aksi apa pun. */
  hanyaLihat?: boolean;
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
  canDelete,
  hanyaLihat = false
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [keputusanOpen, setKeputusanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cetakRevisiOpen, setCetakRevisiOpen] = useState(false);

  // Draft yang masa berlakunya lewat tampil "kedaluwarsa", tapi tetap draft:
  // masih bisa diubah (mis. memperpanjang Berlaku sampai) atau dihapus.
  const draftKedaluwarsa = q.status === "kedaluwarsa" && Boolean(q.belum_dikirim);

  // Sekali terkirim, penawaran tidak boleh diubah lagi — hanya draft yang
  // bisa diedit (satu-satunya jalan merevisi yang semua itemnya ditolak:
  // "Buka kembali" ke draft dulu).
  const isLocked = q.status !== "draft" && !draftKedaluwarsa;
  // Keputusan per item — yang menentukan job & tombol, bukan status surat.
  const adaItemDeal = (q.items ?? []).some((it) => it.keputusan === "deal");
  const semuaDitolak = q.status === "completed" && !adaItemDeal;

  async function changeStatus(status: QuotationStatus) {
    setLoading(true);
    const res = await setQuotationStatus(q.id, status);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Status penawaran diperbarui");
  }

  // Ada revisi harga atau item ditolak → ringkasan biaya dihitung ulang
  // (harga final, tanpa item ditolak) dan angka pengajuan awal dicoret.
  const adaDitolak = q.items.some((it) => it.keputusan === "ditolak");
  const revisi = adaRevisi(q) || adaDitolak ? suratRevisi(q) : null;

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
            {q.objek && (
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--brand-primary-dark)"
                }}
              >
                <Package style={{ width: 14, height: 14, flexShrink: 0 }} />
                {q.objek}
              </p>
            )}
            <p className="caption" style={{ color: "var(--text-tertiary)", marginTop: 4 }}>
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
            {draftKedaluwarsa
              ? " Penawaran ini belum pernah dikirim. Ubah tanggal Berlaku sampai bila ingin mengirimnya."
              : " Keputusan per item masih bisa diisi bila customer baru menjawab."}
          </p>
        )}

        {semuaDitolak && q.alasan_ditolak && (
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
        {!hanyaLihat && (
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

          {/* Surat dengan harga hasil revisi — nomor surat tetap sama. */}
          {/* Cetak pertama: pilih & simpan tanggal surat revisi dulu. Sudah
              pernah → langsung cetak dengan tanggal yang tersimpan. */}
          {adaRevisi(q) &&
            (q.tanggal_revisi ? (
              <Link to={`/quotations/${q.id}/cetak?versi=revisi`} target="_blank">
                <Button variant="secondary" leftIcon={<Printer style={{ width: 15, height: 15 }} />}>
                  Cetak versi revisi
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                leftIcon={<Printer style={{ width: 15, height: 15 }} />}
                onClick={() => setCetakRevisiOpen(true)}
              >
                Cetak versi revisi
              </Button>
            ))}

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

          {/* Deal / tolak ditentukan per item. Kedaluwarsa ikut: customer
              kadang baru menjawab setelah masa berlaku lewat. */}
          {(q.status === "terkirim" || (q.status === "kedaluwarsa" && !draftKedaluwarsa) || q.status === "completed") && (
            <Button
              variant={q.status === "completed" ? "secondary" : "primary"}
              leftIcon={<ListChecks style={{ width: 15, height: 15 }} />}
              onClick={() => setKeputusanOpen(true)}
            >
              {q.status === "completed" ? "Ubah keputusan item" : "Keputusan per item"}
            </Button>
          )}

          {semuaDitolak && (
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

          {canDelete && !isLocked && (
            <Button
              variant="ghost"
              leftIcon={<Trash2 style={{ width: 15, height: 15 }} />}
              onClick={() => setDeleteOpen(true)}
            >
              Hapus
            </Button>
          )}
        </div>
        )}
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
        {/* Masa berlaku surat asli — surat revisi punya panel sendiri di bawah. */}
        {berlakuSuratAsli(q) && <InfoRow label="Berlaku sampai" value={formatDate(berlakuSuratAsli(q)!)} />}

        {adaRevisi(q) && <PanelRevisi q={q} />}
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
                <th style={{ width: 150, textAlign: "right" }}>@ Price</th>
                <th style={{ width: 150, textAlign: "right" }}>Total</th>
                <th style={{ width: 150 }}>Keputusan</th>
                {!hanyaLihat && adaItemDeal && <th style={{ width: 150 }}>Job</th>}
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, idx) => {
                // Item ditolak: baris dicoret (kecuali kolom keputusan & job) — tidak ikut total.
                const coret: React.CSSProperties | undefined =
                  it.keputusan === "ditolak"
                    ? { textDecoration: "line-through", color: "var(--text-tertiary)" }
                    : undefined;
                return (
                <tr key={it.id}>
                  <td style={coret}>{idx + 1}</td>
                  <td style={coret}>{it.dari}</td>
                  <td style={coret}>{it.tujuan}</td>
                  <td style={coret}>
                    {it.qty} {it.satuan}
                    {it.nama_alat && (
                      <div
                        style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}
                      >
                        {it.nama_alat}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right", ...coret }}>
                    <Harga awal={it.harga_satuan} revisi={it.harga_revisi} />
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600, ...coret }}>
                    <Harga awal={it.subtotal} revisi={it.harga_revisi != null ? it.subtotal_final : null} />
                  </td>
                  <td>
                    <KeputusanBadge keputusan={it.keputusan} />
                    {it.keputusan === "ditolak" && it.alasan_ditolak && (
                      <div className="caption" style={{ marginTop: 2 }}>
                        {it.alasan_ditolak}
                      </div>
                    )}
                    {/* Karyawan terakhir yang memberi / mengubah keputusan. */}
                    {it.keputusan !== "menunggu" && it.diputuskan_oleh_nama && (
                      <div className="caption" style={{ marginTop: 2 }}>
                        oleh {it.diputuskan_oleh_nama}
                        {it.diputuskan_at ? ` · ${formatDateTime(it.diputuskan_at)}` : ""}
                      </div>
                    )}
                  </td>
                  {/* Kolom tombol job — untuk item deal, apa pun status suratnya. */}
                  {!hanyaLihat && adaItemDeal && (
                    <td>
                      {it.keputusan === "deal" ? (
                        <>
                          {/* Unit dipilih di form proyek; bila penawaran & unit itu sudah
                              punya proyek, form otomatis menggabungkan job ke sana. */}
                          <Link to={`/proyek/new?quotation=${q.id}&item=${it.id}`}>
                            <Button
                              size="sm"
                              variant={it.jumlah_job > 0 ? "secondary" : "primary"}
                              rightIcon={<ArrowRight style={{ width: 13, height: 13 }} />}
                            >
                              Buat / Gabung Proyek
                            </Button>
                          </Link>
                          {it.jumlah_job > 0 && (
                            <div className="caption" style={{ marginTop: 3 }}>
                              Sudah {it.jumlah_job} job
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
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
          {/* Ada revisi harga / item ditolak → angka pengajuan awal dicoret, di
              sampingnya angka baru (hitungan surat revisi: harga final, item deal
              & menunggu keputusan; item ditolak tidak ikut). */}
          <SumRow label="Subtotal" value={q.subtotal} baru={revisi?.subtotal} />
          {q.ppn_aktif && (
            <SumRow label={`PPN ${Number(q.ppn_persen)}%`} value={q.ppn_nominal} baru={revisi?.ppn_nominal} />
          )}
          <SumRow label="Total" value={q.total} baru={revisi?.total} strong />
        </div>
      </div>

      {/* Job yang lahir dari penawaran ini. Penawaran dengan beberapa rute
          bisa menurunkan lebih dari satu job. */}
      {jobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Proyek dari penawaran ini</p>
            <span className="caption" style={{ color: "var(--text-tertiary)" }}>
              {new Set(jobs.map((j) => j.proyek_id).filter(Boolean)).size} proyek ·{" "}
              {q.items.filter((it) => it.keputusan === "deal").length} item deal
            </span>
          </div>
          <ProyekPenawaran items={q.items} jobs={jobs} />
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

      <KeputusanItemModal
        quotation={q}
        open={keputusanOpen}
        onClose={() => setKeputusanOpen(false)}
      />

      <CetakRevisiModal open={cetakRevisiOpen} onClose={() => setCetakRevisiOpen(false)} quotation={q} />

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

/** Subtotal, PPN (bila aktif), dan total. `pembanding` = diabu-abukan, total tidak ditebalkan. */
/** Harga awal; bila direvisi, harga awal dicoret dan "Rev : nominal" tampil di bawahnya. */
function Harga({ awal, revisi }: { awal: number; revisi?: number | null }) {
  if (revisi == null) return <>{formatRupiah(awal)}</>;
  return (
    <>
      <div style={{ textDecoration: "line-through", color: "var(--text-tertiary)", fontWeight: 400 }}>
        {formatRupiah(awal)}
      </div>
      <div style={{ whiteSpace: "nowrap" }}>Rev : {formatRupiah(revisi)}</div>
    </>
  );
}

function SumRow({
  label,
  value,
  baru,
  strong
}: {
  label: string;
  value: number;
  /** Angka setelah revisi / keputusan; diisi → `value` dicoret. */
  baru?: number | null;
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
      {baru == null ? (
        <span className="mono">{formatRupiah(value)}</span>
      ) : (
        <span className="mono" style={{ display: "inline-flex", gap: 8, alignItems: "baseline", whiteSpace: "nowrap" }}>
          <span style={{ textDecoration: "line-through", color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11.5 }}>
            {formatRupiah(value)}
          </span>
          <span>{formatRupiah(baru)}</span>
        </span>
      )}
    </div>
  );
}

const KEPUTUSAN_KELAS: Record<KeputusanItem, string> = {
  menunggu: "badge-menunggu",
  deal: "badge-selesai",
  ditolak: "badge-cancelled"
};

function KeputusanBadge({ keputusan }: { keputusan: KeputusanItem }) {
  return (
    <span className={`badge ${KEPUTUSAN_KELAS[keputusan]}`}>
      <span className="badge-dot" />
      {keputusanItemLabel[keputusan]}
    </span>
  );
}

/** Harga awal tetap terlihat (dicoret) bila ada revisi. */
/**
 * Panel biru di kartu "Ditujukan kepada": penawaran punya harga revisi —
 * tanggal & masa berlaku surat revisi, serta siapa yang membuatnya.
 */
function PanelRevisi({ q }: { q: Quotation }) {
  const baris = (label: string, nilai: string) => (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
      <span style={{ minWidth: 150, color: "var(--status-pickup-text)", opacity: 0.8 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{nilai}</span>
    </div>
  );
  return (
    <div
      role="note"
      aria-label="Revisi penawaran"
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--status-pickup-bg)",
        color: "var(--status-pickup-text)",
        border: "0.5px solid var(--status-pickup-text)",
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}
    >
      <p style={{ fontWeight: 700, fontSize: 13 }}>Penawaran ini direvisi</p>
      {q.tanggal_revisi ? (
        <>
          {baris("Surat revisi dikeluarkan", formatDate(q.tanggal_revisi))}
          {q.berlaku_sampai && baris("Berlaku sampai", formatDate(q.berlaku_sampai))}
          {baris(
            "Dibuat oleh",
            `${q.revisi_dibuat_oleh_nama ?? "—"}${q.revisi_dibuat_at ? ` · ${formatDateTime(q.revisi_dibuat_at)}` : ""}`
          )}
        </>
      ) : (
        <p style={{ fontSize: 12.5 }}>
          Ada harga item yang direvisi, tetapi surat revisi belum dikeluarkan. Klik <strong>Cetak versi revisi</strong>{" "}
          untuk menentukan tanggal surat & masa berlakunya.
        </p>
      )}
    </div>
  );
}
