import { useRef, useState } from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { queryClient } from "@/lib/api/query";
import { ChevronDown, Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Field, Textarea } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Modal } from "@/components/ui/modal";
import { UangJalanModal } from "./uang-jalan-modal";
import { StatusApprovalBadge } from "@/features/approval/components/status-approval-badge";
import {
  deleteUangJalan,
  rejectRequest,
  setUangJalanAwal,
  type TambahanDibatalkan
} from "@/features/uang-jalan/api";
import { RiwayatApprovalModal, type DetailTambahan } from "./riwayat-approval-modal";
import { formatRupiah, formatDate, formatDateTime } from "@/lib/utils";
import type { SumberDana, UangJalan, UangJalanRequest, UangJalanRingkasan } from "@/types";

interface Props {
  jobId: string;
  sumberDana: SumberDana[];
  transaksi: UangJalan[];
  ringkasan: UangJalanRingkasan;
  /** Pengajuan driver (BR-05); yang berstatus `diajukan` menahan perjalanan. */
  pengajuan?: UangJalanRequest[];
  /** Finance: hanya melihat — tanpa tombol aksi. */
  hanyaLihat?: boolean;
  /** Nomor tagihan bila job sudah ditagihkan — uang jalan tidak bisa ditambah lagi. */
  nomorTagihan?: string | null;
  /** Tanggal uang jalan awal ditetapkan (= job dibuat) — baris pertama riwayat. */
  tanggalAwal?: string;
  /** Pengajuan tambahan yang dihapus selama menunggu — riwayat saja, tidak dihitung. */
  dibatalkan?: TambahanDibatalkan[];
}

function Angka({
  label,
  value,
  warna,
  besar
}: {
  label: string;
  value: string;
  warna?: string;
  besar?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: besar ? 17 : 14.5,
          fontWeight: 700,
          color: warna ?? "var(--text-primary)"
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function UangJalanCard({
  jobId,
  sumberDana,
  transaksi,
  ringkasan,
  pengajuan = [],
  hanyaLihat = false,
  nomorTagihan = null,
  tanggalAwal,
  dibatalkan = []
}: Props) {
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UangJalan | null>(null);
  const [fulfilling, setFulfilling] = useState<UangJalanRequest | null>(null);
  const [rejecting, setRejecting] = useState<UangJalanRequest | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const pendingRequests = pengajuan.filter((r) => r.status === "diajukan");
  const adaBukti = transaksi.some((t) => t.jenis === "pencairan" && t.bukti_transfer_path);
  // BATASAN: uang jalan awal terkunci begitu sudah ada uang jalan yang keluar ke
  // driver (dijaga juga backend & database, migration 20261001000022).
  const awalTerkunci = transaksi.some((t) => t.jenis === "pencairan");

  async function tolak() {
    if (!rejecting) return;
    setSaving(true);
    const res = await rejectRequest(rejecting.id, alasanTolak || null);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pengajuan ditolak");
    setRejecting(null);
    setAlasanTolak("");
  }
  const [hapus, setHapus] = useState<UangJalan | null>(null);
  const [menghapus, setMenghapus] = useState<string | null>(null);
  const sedangHapus = useRef(false);
  // Riwayat selalu mulai terciut setiap halaman dibuka; dibuka sendiri bila perlu.
  const [riwayatTerlipat, setRiwayatTerlipat] = useState(true);
  const lipatRiwayat = () => setRiwayatTerlipat((v) => !v);
  // Transaksi aktif + pengajuan tambahan yang dibatalkan, urut tanggal.
  const riwayat = [
    ...transaksi.map((t) => ({ batal: false as const, t, tanggal: t.tanggal, dibuat: t.created_at })),
    ...dibatalkan.map((d) => ({ batal: true as const, d, tanggal: d.tanggal, dibuat: d.created_at }))
  ].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.dibuat.localeCompare(b.dibuat));
  // Baris "Tambah uang jalan" yang riwayat approval-nya sedang dibuka.
  const [detailTambahan, setDetailTambahan] = useState<DetailTambahan | null>(null);
  const [editUangJalanAwal, setEditUangJalanAwal] = useState(false);
  const [uangJalanAwalDraft, setUangJalanAwalDraft] = useState(String(Math.round(ringkasan.uang_jalan_awal)));
  const [saving, setSaving] = useState(false);

  const belumAdaUangJalan = ringkasan.uang_jalan === 0;
  const minus = ringkasan.sisa < 0;

  async function simpanUangJalanAwal() {
    // BATASAN: uang jalan awal tidak boleh diturunkan di bawah uang yang sudah
    // diberikan (dijaga juga di database, migration 20261001000007).
    const baru = Number(uangJalanAwalDraft) || 0;
    if (baru + ringkasan.tambahan < ringkasan.cair) {
      toast.error(
        `Uang jalan awal terlalu kecil: sudah diberikan ${formatRupiah(ringkasan.cair)} ke driver.`
      );
      return;
    }
    setSaving(true);
    const res = await setUangJalanAwal(jobId, Number(uangJalanAwalDraft) || 0);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Uang jalan tersimpan");
    setEditUangJalanAwal(false);
  }

  async function konfirmasiHapus() {
    // Penjaga klik ganda yang langsung berlaku (state baru berubah setelah render).
    if (!hapus || sedangHapus.current) return;
    sedangHapus.current = true;
    const pengajuan = hapus.jenis === "tambahan";
    // Jendela konfirmasi ditutup, popup loading menutup layar sampai selesai.
    setHapus(null);
    setMenghapus(pengajuan ? "Menghapus pengajuan…" : "Menghapus catatan…");
    const res = await deleteUangJalan(hapus.id, jobId);
    setMenghapus(null);
    sedangHapus.current = false;
    if (!res.ok) return toast.error(res.error);
    toast.success(pengajuan ? "Pengajuan uang jalan dihapus" : "Catatan dihapus");
  }

  return (
    <div className="card card-pad">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 7 }}
          className="eyebrow"
        >
          <Wallet style={{ width: 13, height: 13 }} />
          Uang jalan
        </div>
        {!hanyaLihat && !nomorTagihan && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            Ajukan
          </Button>
        )}
      </div>

      {nomorTagihan && !hanyaLihat && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Job sudah ditagihkan ({nomorTagihan}) — uang jalan tidak bisa ditambah lagi.
        </p>
      )}

      {/* Ringkasan */}
      {editUangJalanAwal ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              Uang jalan awal
            </div>
            <CurrencyInput
              autoFocus
              value={uangJalanAwalDraft}
              onChange={setUangJalanAwalDraft}
            />
          </div>
          <Button size="sm" onClick={simpanUangJalanAwal} loading={saving}>
            Simpan
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setUangJalanAwalDraft(String(Math.round(ringkasan.uang_jalan_awal)));
              setEditUangJalanAwal(false);
            }}
          >
            Batal
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: "12px 14px",
            background: "var(--bg-subtle)",
            borderRadius: 10,
            marginBottom: 14
          }}
        >
          <div>
            {/* Hanya nominal — rinciannya ada di riwayat uang jalan di bawah. */}
            <Angka label="TOTAL UJ" value={formatRupiah(ringkasan.uang_jalan)} />
            {!hanyaLihat && !awalTerkunci && (
            <button
              type="button"
              className="btn-link"
              style={{ fontSize: 11, marginTop: 2 }}
              onClick={() => {
                setUangJalanAwalDraft(String(Math.round(ringkasan.uang_jalan_awal)));
                setEditUangJalanAwal(true);
              }}
            >
              Ubah uang jalan awal
            </button>
            )}

          </div>
          <Angka label="Sudah dikasih" value={formatRupiah(ringkasan.cair)} />
          <Angka
            label={minus ? "Lebih dikasih" : "Belum dikasih"}
            value={formatRupiah(Math.abs(ringkasan.sisa))}
            warna={minus ? "#c13838" : "var(--brand-primary-dark)"}
            besar
          />
        </div>
      )}

      {belumAdaUangJalan && !editUangJalanAwal && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Uang jalan job belum diisi. Sisanya belum bisa dihitung sebelum angkanya
          ada.
        </p>
      )}

      {/* Pengajuan driver yang menunggu kasir (Fase 3) */}
      {pendingRequests.length > 0 && (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}
        >
          {pendingRequests.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#9a3412" }}>
                  Driver mengajukan {formatRupiah(r.nominal)}
                </div>
                <div className="caption">
                  {formatDateTime(r.requested_at)}
                  {r.catatan ? ` · ${r.catatan}` : ""} — perjalanan tertahan sampai dicairkan
                </div>
              </div>
              {!hanyaLihat && !nomorTagihan && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFulfilling(r);
                    setModalOpen(true);
                  }}
                >
                  Cairkan + bukti
                </Button>
              )}
              {!hanyaLihat && (
                <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                  Tolak
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {!adaBukti && pendingRequests.length === 0 && ringkasan.uang_jalan > 0 && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Belum ada pencairan berbukti — tahap muat driver masih terkunci (BR-02).
        </p>
      )}

      <button
        type="button"
        onClick={lipatRiwayat}
        aria-expanded={!riwayatTerlipat}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: 0,
          padding: "4px 0 8px",
          cursor: "pointer",
          font: "inherit",
          color: "inherit"
        }}
      >
        <span className="eyebrow">Riwayat uang jalan ({riwayat.length + (ringkasan.uang_jalan_awal > 0 ? 1 : 0)})</span>
        <span className="caption" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {riwayatTerlipat ? "Tampilkan" : "Sembunyikan"}
          <ChevronDown
            style={{ width: 14, height: 14, transform: riwayatTerlipat ? "none" : "rotate(180deg)", transition: "transform 150ms" }}
          />
        </span>
      </button>

      {!riwayatTerlipat && (
      <>
      {/* Riwayat — diawali uang jalan awal (ditetapkan saat job dibuat). */}
      {ringkasan.uang_jalan_awal > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0",
            borderBottom: "1px solid var(--border-default)"
          }}
        >
          <div style={{ minWidth: 62 }} className="caption mono">
            {tanggalAwal ? formatDate(tanggalAwal) : "—"}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>Uang jalan awal</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
            {formatRupiah(ringkasan.uang_jalan_awal)}
          </div>
        </div>
      )}
      {riwayat.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-tertiary)",
            margin: 0,
            padding: "8px 0"
          }}
        >
          Belum ada yang dikasih.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {riwayat.map((baris) => {
            if (baris.batal) {
              const d = baris.d;
              // Pengajuan tambahan yang dihapus selama menunggu: riwayat saja.
              return (
                <div
                  key={`batal-${d.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-default)",
                    opacity: 0.75
                  }}
                >
                  <div style={{ minWidth: 62 }} className="caption mono">
                    {formatDate(d.tanggal)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Tambah uang jalan</span>
                        <span className="badge" style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                          Dibatalkan
                        </span>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11.5, fontWeight: 500 }}
                          onClick={() => setDetailTambahan({ ...d, dibatalkan: true })}
                        >
                          Lihat detail
                        </button>
                      </span>
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tertiary)" }}>
                    +{formatRupiah(d.jumlah)}
                  </div>
                </div>
              );
            }
            const t = baris.t;
            const tambah = t.jenis === "tambahan";
            const statusTambahan = tambah ? (t.status_approval ?? "disetujui") : null;
            // BATASAN: tambahan yang sudah disetujui / ditolak tidak bisa diubah
            // (dijaga database, migration 20261001000010); masih bisa dihapus.
            const bisaDiubah = statusTambahan === null || statusTambahan === "menunggu";
            // BATASAN: tambahan yang sudah diputuskan (disetujui / ditolak) tidak bisa
            // diubah maupun dihapus (hapus dijaga juga backend, UangJalanService.delete).
            const sudahDiputuskan = statusTambahan === "disetujui" || statusTambahan === "ditolak";
            // Pengembalian & kasbon supir: riwayat ganti driver / unit — tidak bisa
            // diubah / dihapus (dijaga database). BATASAN: hanya pengembalian yang
            // mengurangi uang yang sudah cair; kasbon tidak (migration 20261001000017).
            const penggantian = t.jenis === "pengembalian" || t.jenis === "kasbon";
            const kasbon = t.jenis === "kasbon";
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-default)"
                }}
              >
                <div style={{ minWidth: 62 }} className="caption mono">
                  {formatDate(t.tanggal)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {tambah ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: "#b45309" }}>Tambah uang jalan</span>
                        {statusTambahan !== "disetujui" && statusTambahan && (
                          <StatusApprovalBadge status={statusTambahan} />
                        )}
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11.5, fontWeight: 500 }}
                          onClick={() => setDetailTambahan(t)}
                        >
                          Lihat detail
                        </button>
                      </span>
                    ) : penggantian ? (
                      <span style={{ color: "var(--status-perjalanan-text)" }}>
                        {t.jenis === "kasbon" ? "Kasbon supir" : `Dikembalikan ke ${t.sumber_dana_nama ?? "kas"}`}
                      </span>
                    ) : (
                      t.sumber_dana_nama ?? "—"
                    )}
                  </div>
                  {/* Tambahan: alasan & catatan dilihat di modal "Lihat detail" supaya ringkas. */}
                  {!tambah && (t.keperluan || t.catatan) && (
                    <div className="caption" style={{ marginTop: 1 }}>
                      {[t.keperluan, t.catatan].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {t.jenis === "pencairan" &&
                    (t.bukti_transfer_url ? (
                      <a
                        href={t.bukti_transfer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-link"
                        style={{ fontSize: 11.5 }}
                      >
                        Lihat bukti transfer
                      </a>
                    ) : (
                      <div className="caption" style={{ color: "#b45309" }}>
                        Tanpa bukti transfer (catatan lama)
                      </div>
                    ))}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: tambah ? "#b45309" : "var(--text-primary)",
                    // Tambahan yang ditolak tidak dihitung — dicoret supaya jelas.
                    textDecoration: statusTambahan === "ditolak" ? "line-through" : undefined
                  }}
                >
                  {tambah ? "+" : penggantian && !kasbon ? "−" : ""}
                  {formatRupiah(t.jumlah)}
                </div>
                {/* Pencairan dari pengajuan driver: hanya lihat bukti transfer. */}
                {!hanyaLihat && !t.request_id && !penggantian && !sudahDiputuskan && (
                <div style={{ display: "flex", gap: 2 }}>
                  {bisaDiubah && (
                  <button
                    type="button"
                    className="btn-icon"
                    title="Ubah"
                    onClick={() => {
                      setEditing(t);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil style={{ width: 13, height: 13 }} />
                  </button>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    title="Hapus"
                    onClick={() => setHapus(t)}
                  >
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      <UangJalanModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFulfilling(null);
        }}
        jobId={jobId}
        sumberDana={sumberDana}
        ringkasan={ringkasan}
        existing={editing}
        request={fulfilling}
        onSaved={() => queryClient.invalidateQueries()}
      />
      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Tolak pengajuan uang jalan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => void tolak()} loading={saving}>
              Tolak
            </Button>
          </>
        }
      >
        <Field label="Alasan (dikirim ke driver)">
          <Textarea rows={2} value={alasanTolak} onChange={(e) => setAlasanTolak(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!hapus}
        onClose={() => setHapus(null)}
        onConfirm={konfirmasiHapus}
        // Tambahan yang masih menunggu = pengajuan; pencairan manual = catatan.
        title={hapus?.jenis === "tambahan" ? "Hapus pengajuan uang jalan?" : "Hapus catatan uang jalan?"}
        body={
          hapus ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
              <span className="caption">Tanggal</span>
              <strong>{formatDate(hapus.tanggal)}</strong>
              <span className="caption">Nominal</span>
              <strong className="mono">{formatRupiah(hapus.jumlah)}</strong>
            </div>
          ) : null
        }
        confirmText="Hapus"
        variant="danger"
      />
      <RiwayatApprovalModal tambahan={detailTambahan} onClose={() => setDetailTambahan(null)} />
      <LoadingOverlay message={menghapus} />
    </div>
  );
}
