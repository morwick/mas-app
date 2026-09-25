import { useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
  Undo2,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { InfoUangJalanSurat } from "./info-uang-jalan-surat";
import {
  addInvoicePayment,
  deleteInvoicePayment,
  setInvoiceStatus,
  uploadFakturPajak
} from "@/features/invoices/api";
import type { Invoice, SumberDana } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";

interface Props {
  invoice: Invoice;
  sumberDana: SumberDana[];
}

function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function displayRupiah(s: string): string {
  const n = parseRupiah(s);
  return n ? new Intl.NumberFormat("id-ID").format(n) : "";
}

export function InvoiceDetailView({ invoice: inv, sumberDana }: Props) {
  const toast = useToast();

  const [pending, setPending] = useState(false);
  const [batalOpen, setBatalOpen] = useState(false);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [hapusBayar, setHapusBayar] = useState<string | null>(null);

  const [bayar, setBayar] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    // Diisi sisa tagihan: pelunasan penuh adalah kasus yang paling sering,
    // dan mengetik ulang angka besar rawan salah ketik.
    jumlah: String(inv.sisa > 0 ? inv.sisa : ""),
    sumber_dana_id: sumberDana[0]?.id ?? "",
    metode: "transfer",
    referensi: "",
    catatan: ""
  });
  const [bayarOpen, setBayarOpen] = useState(false);
  const [uploadingFaktur, setUploadingFaktur] = useState(false);
  const fakturInputRef = useRef<HTMLInputElement>(null);

  const bisaDiedit = inv.status === "draft" || inv.status === "terkirim";

  async function ubahStatus(
    status: "draft" | "terkirim" | "batal",
    alasan?: string
  ) {
    setPending(true);
    const res = await setInvoiceStatus(inv.id, status, { alasan });
    setPending(false);
    setBatalOpen(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      status === "terkirim"
        ? "Tagihan ditandai terkirim"
        : status === "batal"
          ? "Tagihan dibatalkan"
          : "Tagihan dikembalikan ke draft"
    );
  }

  async function simpanPembayaran() {
    const jumlah = parseRupiah(bayar.jumlah);
    if (jumlah <= 0) {
      toast.error("Jumlah pembayaran harus lebih dari 0");
      return;
    }
    setPending(true);
    const res = await addInvoicePayment(inv.id, {
      tanggal: bayar.tanggal,
      jumlah,
      sumber_dana_id: bayar.sumber_dana_id || null,
      metode: bayar.metode,
      referensi: bayar.referensi,
      catatan: bayar.catatan
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pembayaran dicatat");
    setBayarOpen(false);
    setBayar((b) => ({ ...b, jumlah: "", referensi: "", catatan: "" }));
  }

  async function hapusPembayaran(id: string) {
    setPending(true);
    const res = await deleteInvoicePayment(id, inv.id);
    setPending(false);
    setHapusBayar(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pembayaran dihapus");
  }

  async function onFileFakturPajak(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingFaktur(true);
    const res = await uploadFakturPajak(inv.id, file);
    setUploadingFaktur(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Faktur pajak diunggah");
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Toolbar */}
      <div className="toolbar">
        <Link
          to="/invoices"
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
          Semua tagihan
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link
            to={`/invoices/${inv.id}/cetak`}
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: "none" }}
          >
            <Printer style={{ width: 14, height: 14 }} />
            Cetak
          </Link>
          {bisaDiedit && (
            <Link
              to={`/invoices/${inv.id}/edit`}
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Pencil style={{ width: 14, height: 14 }} />
              Edit
            </Link>
          )}
          {inv.status === "draft" && (
            <Button
              size="sm"
              loading={pending}
              leftIcon={<Send style={{ width: 14, height: 14 }} />}
              onClick={() => ubahStatus("terkirim")}
            >
              Tandai terkirim
            </Button>
          )}
          {inv.status === "terkirim" && inv.payments.length === 0 && (
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              leftIcon={<Undo2 style={{ width: 14, height: 14 }} />}
              onClick={() => ubahStatus("draft")}
            >
              Kembalikan ke draft
            </Button>
          )}
          {inv.status !== "batal" && inv.status !== "lunas" && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Ban style={{ width: 14, height: 14 }} />}
              onClick={() => setBatalOpen(true)}
            >
              Batalkan
            </Button>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="card card-pad-lg">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 4
              }}
            >
              <span className="mono h2" style={{ fontSize: 20 }}>
                {inv.invoice_number}
              </span>
              <InvoiceStatusBadge
                status={inv.status_tampil}
                hariTerlambat={inv.hari_terlambat}
              />
            </div>
            <div className="body-sm muted">
              {inv.customer_nama}
              {inv.pic_nama ? ` · ${inv.pic_sapaan ?? "Bapak"} ${inv.pic_nama}` : ""}
            </div>
            {inv.quotation_id && inv.quotation_number && (
              <Link
                to={`/quotations/${inv.quotation_id}`}
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--brand-primary-light)",
                  color: "var(--brand-primary-dark)",
                  textDecoration: "none"
                }}
              >
                <FileText style={{ width: 12, height: 12 }} />
                {inv.quotation_number}
              </Link>
            )}
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="eyebrow">Sisa tagihan</div>
            <div
              className="mono"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color:
                  inv.status === "batal"
                    ? "var(--text-tertiary)"
                    : inv.sisa > 0 && inv.status_tampil === "jatuh_tempo"
                      ? "#C13838"
                      : inv.sisa > 0
                        ? "var(--text-primary)"
                        : "var(--brand-primary-dark)"
              }}
            >
              {inv.status === "batal" ? "—" : formatRupiah(inv.sisa)}
            </div>
            <div className="caption" style={{ color: "var(--text-tertiary)" }}>
              dari {formatRupiah(inv.total)}
            </div>
          </div>
        </div>

        <div className="divider" style={{ margin: "14px 0" }} />

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"
          }}
        >
          <MetaField label="Tanggal tagihan" value={formatDate(inv.tanggal)} />
          <MetaField
            label="Termin"
            value={inv.termin_hari != null ? `${inv.termin_hari} hari` : "—"}
          />
          <MetaField
            label="Jatuh tempo"
            value={inv.jatuh_tempo ? formatDate(inv.jatuh_tempo) : "—"}
          />
          <MetaField label="NPWP" value={inv.customer_npwp || "—"} mono />
          <MetaField
            label="Sudah dibayar"
            value={formatRupiah(inv.dibayar)}
            mono
          />
        </div>

        {inv.status === "batal" && inv.alasan_batal && (
          <p
            style={{
              marginTop: 14,
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--status-cancelled-bg)",
              color: "var(--status-cancelled-text)",
              fontSize: 12.5
            }}
          >
            Dibatalkan: {inv.alasan_batal}
          </p>
        )}
      </div>

      {/* Rincian */}
      <div className="card">
        <div className="card-header">
          <p className="eyebrow">Rincian tagihan</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>No</th>
                <th>Uraian</th>
                <th style={{ width: 190 }}>Job</th>
                <th style={{ width: 90 }}>Jumlah</th>
                <th style={{ width: 140, textAlign: "right" }}>Harga</th>
                <th style={{ width: 140, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="muted">{idx + 1}</td>
                  <td>
                    <div style={{ fontSize: 13.5 }}>{it.deskripsi}</div>
                    {(it.dari || it.tujuan) && (
                      <div
                        style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}
                      >
                        {it.dari} → {it.tujuan}
                      </div>
                    )}
                  </td>
                  <td>
                    {it.job_id && it.job_number ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <Link
                          to={`/jobs/${it.job_id}`}
                          className="mono"
                          style={{
                            fontSize: 11.5,
                            color: "var(--brand-primary-dark)",
                            textDecoration: "none"
                          }}
                        >
                          {it.job_number}
                        </Link>
                        <InfoUangJalanSurat
                          uangJalanPagu={it.uang_jalan_pagu}
                          uangJalanCair={it.uang_jalan_cair}
                          suratJalanUrls={it.surat_jalan_urls}
                        />
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {it.qty} {it.satuan}
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                    {formatRupiah(it.harga_satuan)}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}
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
          <TotalRow label="Subtotal" value={inv.subtotal} />
          {inv.ppn_aktif && (
            <TotalRow label={`PPN ${inv.ppn_persen}%`} value={inv.ppn_nominal} />
          )}
          <TotalRow label="Total tagihan" value={inv.total} strong />
          <TotalRow label="Sudah dibayar" value={inv.dibayar} />
          <TotalRow label="Sisa" value={inv.sisa} strong />
        </div>
      </div>

      {/* Pembayaran */}
      <div className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Pembayaran</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              {inv.payments.length === 0
                ? "Belum ada pembayaran masuk"
                : `${inv.payments.length} kali pembayaran`}
            </p>
          </div>
          {inv.status !== "draft" && inv.status !== "batal" && inv.sisa > 0 && (
            <Button
              size="sm"
              leftIcon={<Plus style={{ width: 14, height: 14 }} />}
              onClick={() => setBayarOpen((v) => !v)}
            >
              Catat pembayaran
            </Button>
          )}
        </div>

        {inv.status === "draft" && (
          <div className="card-pad">
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              Tandai tagihan sebagai terkirim dulu. Pembayaran atas tagihan yang
              belum pernah dikirim ke customer hampir selalu berarti ada yang
              keliru.
            </p>
          </div>
        )}

        {bayarOpen && (
          <div
            className="card-pad"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
              }}
            >
              <Field label="Tanggal masuk" required>
                <Input
                  type="date"
                  value={bayar.tanggal}
                  onChange={(e) =>
                    setBayar((b) => ({ ...b, tanggal: e.target.value }))
                  }
                />
              </Field>
              <Field label="Jumlah" required hint={`Sisa ${formatRupiah(inv.sisa)}`}>
                <Input
                  inputMode="numeric"
                  value={displayRupiah(bayar.jumlah)}
                  onChange={(e) =>
                    setBayar((b) => ({ ...b, jumlah: e.target.value }))
                  }
                  leftIcon={<span style={{ fontSize: 12 }}>Rp</span>}
                />
              </Field>
              <Field label="Masuk ke">
                <Combobox
                  value={bayar.sumber_dana_id}
                  onChange={(v) => setBayar((b) => ({ ...b, sumber_dana_id: v }))}
                  options={sumberDana.map((s) => ({ value: s.id, label: s.nama }))}
                  placeholder="— tidak dicatat —"
                  searchPlaceholder="Cari kas / rekening…"
                  clearable
                />
              </Field>
              <Field label="Metode">
                <Select
                  value={bayar.metode}
                  onChange={(e) =>
                    setBayar((b) => ({ ...b, metode: e.target.value }))
                  }
                >
                  <option value="transfer">Transfer</option>
                  <option value="tunai">Tunai</option>
                  <option value="giro">Giro / cek</option>
                  <option value="lainnya">Lainnya</option>
                </Select>
              </Field>
              <Field label="Referensi" hint="No. bukti transfer, dipakai saat rekonsiliasi">
                <Input
                  value={bayar.referensi}
                  onChange={(e) =>
                    setBayar((b) => ({ ...b, referensi: e.target.value }))
                  }
                  placeholder="mis. TRX20260907001"
                />
              </Field>
            </div>
            <Field label="Catatan">
              <Textarea
                value={bayar.catatan}
                onChange={(e) =>
                  setBayar((b) => ({ ...b, catatan: e.target.value }))
                }
                placeholder="Opsional"
              />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setBayarOpen(false)}>
                Batal
              </Button>
              <Button loading={pending} onClick={simpanPembayaran}>
                Simpan pembayaran
              </Button>
            </div>
          </div>
        )}

        {inv.payments.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Tanggal</th>
                  <th style={{ width: 150, textAlign: "right" }}>Jumlah</th>
                  <th style={{ width: 130 }}>Masuk ke</th>
                  <th style={{ width: 100 }}>Metode</th>
                  <th>Referensi</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12.5 }}>{formatDate(p.tanggal)}</td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        fontWeight: 600
                      }}
                    >
                      {formatRupiah(p.jumlah)}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {p.sumber_dana_nama ?? "—"}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{p.metode}</td>
                    <td
                      className="mono muted"
                      style={{ fontSize: 11.5 }}
                    >
                      {p.referensi ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Hapus pembayaran"
                        onClick={() => setHapusBayar(p.id)}
                      >
                        <Trash2
                          style={{ width: 14, height: 14, color: "#C13838" }}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inv.status === "lunas" && (
          <div
            className="card-pad"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--brand-primary-dark)",
              fontSize: 13
            }}
          >
            <CheckCircle2 style={{ width: 16, height: 16 }} />
            Lunas
            {inv.lunas_at
              ? ` sejak ${formatDate(inv.lunas_at.slice(0, 10))}`
              : ""}
          </div>
        )}
      </div>

      {/* Faktur pajak — baru relevan setelah tagihan benar-benar dikirim. */}
      {inv.status !== "draft" && (
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Faktur Pajak</p>
              <p className="caption" style={{ color: "var(--text-tertiary)" }}>
                {inv.faktur_pajak_uploaded_at
                  ? `Diunggah ${formatDate(inv.faktur_pajak_uploaded_at.slice(0, 10))}`
                  : "Belum diunggah"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {inv.faktur_pajak_url && (
                <a href={inv.faktur_pajak_url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm" leftIcon={<FileText style={{ width: 14, height: 14 }} />}>
                    Lihat faktur pajak
                  </Button>
                </a>
              )}
              <Button
                size="sm"
                variant={inv.faktur_pajak_url ? "secondary" : "primary"}
                leftIcon={<Upload style={{ width: 14, height: 14 }} />}
                loading={uploadingFaktur}
                onClick={() => fakturInputRef.current?.click()}
              >
                {inv.faktur_pajak_url ? "Ganti file" : "Upload Faktur Pajak"}
              </Button>
              <input
                ref={fakturInputRef}
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={onFileFakturPajak}
              />
            </div>
          </div>
        </div>
      )}

      {inv.catatan && (
        <div className="card card-pad">
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Catatan internal
          </p>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{inv.catatan}</p>
        </div>
      )}

      <ConfirmDialog
        open={batalOpen}
        onClose={() => setBatalOpen(false)}
        title={`Batalkan tagihan ${inv.invoice_number}?`}
        body={
          <div>
            <p style={{ marginBottom: 10 }}>
              Nomornya tetap tersimpan di arsip. Job yang ditagihkan di sini
              akan kembali muncul sebagai belum ditagih.
            </p>
            <Field label="Alasan pembatalan">
              <Input
                value={alasanBatal}
                onChange={(e) => setAlasanBatal(e.target.value)}
                placeholder="mis. salah customer"
              />
            </Field>
          </div>
        }
        confirmText="Ya, batalkan"
        variant="danger"
        loading={pending}
        onConfirm={() => ubahStatus("batal", alasanBatal)}
      />

      <ConfirmDialog
        open={Boolean(hapusBayar)}
        onClose={() => setHapusBayar(null)}
        title="Hapus catatan pembayaran ini?"
        body="Sisa tagihan akan dihitung ulang. Kalau tagihan ini sudah lunas, statusnya kembali jadi terkirim."
        confirmText="Ya, hapus"
        variant="danger"
        loading={pending}
        onConfirm={() => hapusBayar && hapusPembayaran(hapusBayar)}
      />
    </div>
  );
}

function MetaField({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div className={mono ? "mono" : undefined} style={{ fontSize: 13.5 }}>
        {value}
      </div>
    </div>
  );
}

function TotalRow({
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
        alignItems: "baseline",
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
