import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, History, Pencil, Phone, RefreshCw, ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DOKUMEN_KOSONG, DokumenInput, type NilaiDokumen } from "@/components/ui/dokumen-input";
import { Field } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { tautanWhatsApp } from "@/lib/server-page";
import { formatDate, formatRupiah, tambahHari } from "@/lib/utils";
import {
  KEADAAN_POLIS,
  createPolis,
  deletePolis,
  labelPertanggungan,
  updatePolis,
  type AsetPolis,
  type PolisAsuransi
} from "../api";
import { usePolisAset } from "../queries";
import {
  POLIS_KOSONG,
  PolisFields,
  isianKePolis,
  periksaPolis,
  polisKeIsian,
  type ErrorPolis,
  type PolisIsian
} from "./polis-fields";

// ── Bagian "Asuransi (opsional)" di form tambah / edit unit & unit trailer ──

export interface NilaiAsuransiForm {
  aktif: boolean;
  isi: PolisIsian;
  dokumen: NilaiDokumen;
}

export function awalAsuransiForm(polis: PolisAsuransi | null | undefined): NilaiAsuransiForm {
  return { aktif: Boolean(polis), isi: polis ? polisKeIsian(polis) : POLIS_KOSONG, dokumen: DOKUMEN_KOSONG };
}

/**
 * Isi payload form aset: `polis` (tambah / ubah polis terkini) atau
 * `hapus_polis` bila centang asuransi dilepas pada aset yang sudah berpolis.
 */
export function payloadAsuransi(nilai: NilaiAsuransiForm, polisLama: PolisAsuransi | null | undefined) {
  if (nilai.aktif) {
    return {
      polis: { ...isianKePolis(nilai.isi), hapus_dokumen_polis: nilai.dokumen.hapus },
      polis_id: polisLama?.id ?? null,
      hapus_polis: false
    };
  }
  return { polis: null, polis_id: polisLama?.id ?? null, hapus_polis: Boolean(polisLama) };
}

export function BagianAsuransiForm({
  value,
  onChange,
  error,
  polisLama,
  labelAset
}: {
  value: NilaiAsuransiForm;
  onChange: (v: NilaiAsuransiForm) => void;
  error?: ErrorPolis;
  polisLama?: PolisAsuransi | null;
  labelAset: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2" style={{ cursor: "pointer", fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={value.aktif}
          onChange={(e) => onChange({ ...value, aktif: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: "var(--brand-primary)" }}
        />
        {labelAset} ini diasuransikan
      </label>
      {!value.aktif && polisLama && (
        <p className="caption" style={{ color: "var(--status-danger-text)" }}>
          Polis {polisLama.nomor_polis} ({polisLama.asuransi_nama}) akan dihapus saat disimpan.
        </p>
      )}
      {value.aktif && (
        <>
          {polisLama && (
            <p className="caption">
              Mengubah polis terkini. Untuk perpanjangan (polis baru), pakai tombol{" "}
              <strong>Perpanjang polis</strong> di halaman detail — polis lama tetap tersimpan sebagai riwayat.
            </p>
          )}
          <PolisFields value={value.isi} onChange={(isi) => onChange({ ...value, isi })} error={error} />
          <Field label="Dokumen polis" hint="Opsional. PDF / foto, maks. 10 MB.">
            <DokumenInput
              nama="polis"
              value={value.dokumen}
              onChange={(dokumen) => onChange({ ...value, dokumen })}
              url={polisLama?.polis_url}
            />
          </Field>
        </>
      )}
    </div>
  );
}

// ── Modal tambah / perpanjang / ubah polis (dari halaman detail aset) ───────

export function PolisFormModal({
  open,
  aset,
  polis,
  perpanjangDari,
  onClose
}: {
  open: boolean;
  aset: AsetPolis;
  /** Polis yang diubah; null = polis baru. */
  polis: PolisAsuransi | null;
  /** Perpanjangan: isian awal disalin dari polis ini (periode digeser). */
  perpanjangDari?: PolisAsuransi | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [isi, setIsi] = useState<PolisIsian>(POLIS_KOSONG);
  const [dokumen, setDokumen] = useState<NilaiDokumen>(DOKUMEN_KOSONG);
  const [error, setError] = useState<ErrorPolis>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDokumen(DOKUMEN_KOSONG);
    setError({});
    if (polis) setIsi(polisKeIsian(polis));
    else if (perpanjangDari) {
      const mulai = tambahHari(perpanjangDari.berakhir, 1);
      setIsi({ ...polisKeIsian(perpanjangDari), nomor_polis: "", mulai, berakhir: tambahHari(mulai, 364) });
    } else setIsi(POLIS_KOSONG);
  }, [open, polis, perpanjangDari]);

  async function simpan() {
    const e = periksaPolis(isi);
    setError(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const input = { ...isianKePolis(isi), hapus_dokumen_polis: dokumen.hapus };
    const res = polis ? await updatePolis(polis.id, input, dokumen.file) : await createPolis(aset, input, dokumen.file);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(polis ? "Polis diperbarui" : perpanjangDari ? "Polis diperpanjang" : "Polis ditambahkan");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={polis ? "Edit polis asuransi" : perpanjangDari ? "Perpanjang polis asuransi" : "Tambah polis asuransi"}
      description={perpanjangDari && !polis ? "Polis lama tetap tersimpan sebagai riwayat." : undefined}
      maxWidth="max-w-[640px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={simpan} loading={busy}>
            Simpan polis
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PolisFields value={isi} onChange={setIsi} error={error} />
        <Field label="Dokumen polis" hint="Opsional. PDF / foto, maks. 10 MB.">
          <DokumenInput nama="polis" value={dokumen} onChange={setDokumen} url={polis?.polis_url} />
        </Field>
      </div>
      <LoadingOverlay message={busy ? "Menyimpan polis…" : null} />
    </Modal>
  );
}

// ── Kartu Asuransi di detail unit / unit trailer ────────────────────────────

export function KartuAsuransi({ aset, polis }: { aset: AsetPolis; polis: PolisAsuransi | null | undefined }) {
  const { canManageOperational } = useAuth();
  const [modal, setModal] = useState<{ polis: PolisAsuransi | null; perpanjang: PolisAsuransi | null } | null>(null);
  const [riwayatOpen, setRiwayatOpen] = useState(false);
  const pic = polis?.pic_utama;
  const wa = pic ? tautanWhatsApp(pic.no_hp) : null;
  const keadaan = polis ? KEADAAN_POLIS[polis.keadaan] : null;
  const mendekati = polis?.keadaan === "berlaku" && polis.sisa_hari != null && polis.sisa_hari <= 30;

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-2" style={{ marginBottom: 4 }}>
        <div className="h3">Asuransi</div>
        {keadaan && <span className={`badge ${keadaan.kelas}`}>{keadaan.label}</span>}
      </div>
      {!polis ? (
        <>
          <div className="caption" style={{ marginBottom: 12 }}>
            Belum ada polis asuransi.
          </div>
          {canManageOperational && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ShieldPlus className="w-3.5 h-3.5" />}
              onClick={() => setModal({ polis: null, perpanjang: null })}
            >
              Tambah polis
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="caption" style={{ marginBottom: 12 }}>
            {polis.keadaan === "berakhir"
              ? `Berakhir ${formatDate(polis.berakhir)} — perlu diperpanjang`
              : mendekati
                ? `Habis ${polis.sisa_hari} hari lagi — segera perpanjang`
                : `Berlaku ${formatDate(polis.mulai)} – ${formatDate(polis.berakhir)}`}
          </div>
          <div className="flex flex-col gap-2" style={{ fontSize: 12.5 }}>
            <Baris label="Asuransi">
              <Link to={`/asuransi/${polis.asuransi_id}`} style={{ fontWeight: 600 }}>
                {polis.asuransi_nama}
              </Link>
            </Baris>
            <Baris label="No. polis">
              <span className="mono">{polis.nomor_polis}</span>
            </Baris>
            <Baris label="Pertanggungan">{labelPertanggungan(polis.jenis_pertanggungan)}</Baris>
            {polis.nilai_pertanggungan != null && (
              <Baris label="Nilai">{formatRupiah(polis.nilai_pertanggungan)}</Baris>
            )}
            <Baris label="Own risk">{polis.own_risk != null ? formatRupiah(polis.own_risk) : "—"}</Baris>
            {pic && (
              <Baris label="PIC">
                <div style={{ textAlign: "right" }}>
                  <div>
                    {pic.sapaan ? `${pic.sapaan} ` : ""}
                    {pic.nama}
                  </div>
                  <a
                    href={wa ?? `tel:${pic.no_hp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-center gap-1"
                    style={{ color: "var(--brand-primary-dark)" }}
                  >
                    <Phone style={{ width: 11, height: 11 }} />
                    {pic.no_hp}
                  </a>
                </div>
              </Baris>
            )}
          </div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
            {polis.polis_url && (
              <a href={polis.polis_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary" leftIcon={<FileText className="w-3.5 h-3.5" />}>
                  Lihat polis
                </Button>
              </a>
            )}
            {canManageOperational && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => setModal({ polis: null, perpanjang: polis })}
                >
                  Perpanjang polis
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={() => setModal({ polis, perpanjang: null })}
                >
                  Edit
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<History className="w-3.5 h-3.5" />}
              onClick={() => setRiwayatOpen(true)}
            >
              Riwayat
            </Button>
          </div>
        </>
      )}
      <PolisFormModal
        open={modal !== null}
        aset={aset}
        polis={modal?.polis ?? null}
        perpanjangDari={modal?.perpanjang ?? null}
        onClose={() => setModal(null)}
      />
      <RiwayatPolisModal
        open={riwayatOpen}
        aset={aset}
        onClose={() => setRiwayatOpen(false)}
        onEdit={(p) => {
          setRiwayatOpen(false);
          setModal({ polis: p, perpanjang: null });
        }}
      />
    </div>
  );
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3" style={{ alignItems: "baseline" }}>
      <span className="caption">{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{children}</span>
    </div>
  );
}

function RiwayatPolisModal({
  open,
  aset,
  onClose,
  onEdit
}: {
  open: boolean;
  aset: AsetPolis;
  onClose: () => void;
  onEdit: (p: PolisAsuransi) => void;
}) {
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const riwayat = usePolisAset(open ? aset : null);
  const [hapus, setHapus] = useState<PolisAsuransi | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Riwayat polis asuransi" maxWidth="max-w-[680px]">
      {riwayat.isPending ? (
        <p className="caption">Memuat riwayat polis…</p>
      ) : (riwayat.data ?? []).length === 0 ? (
        <p className="caption">Belum ada polis.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(riwayat.data ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 flex-wrap"
              style={{ padding: 10, border: "0.5px solid var(--border-default)", borderRadius: 8 }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  <ShieldCheck className="inline w-3.5 h-3.5" /> {p.asuransi_nama} ·{" "}
                  <span className="mono">{p.nomor_polis}</span>
                </div>
                <div className="caption">
                  {formatDate(p.mulai)} – {formatDate(p.berakhir)} · Own risk{" "}
                  {p.own_risk != null ? formatRupiah(p.own_risk) : "—"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`badge ${KEADAAN_POLIS[p.keadaan].kelas}`}>{KEADAAN_POLIS[p.keadaan].label}</span>
                {p.polis_url && (
                  <a href={p.polis_url} target="_blank" rel="noreferrer" aria-label="Lihat polis">
                    <Button size="sm" variant="ghost" leftIcon={<FileText className="w-3.5 h-3.5" />} />
                  </a>
                )}
                {canManageOperational && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Edit polis"
                      leftIcon={<Pencil className="w-3.5 h-3.5" />}
                      onClick={() => onEdit(p)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Hapus polis"
                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => setHapus(p)}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        title={`Hapus polis ${hapus?.nomor_polis ?? ""}?`}
        body="Polis yang sudah dipakai di perintah kerja tidak bisa dihapus."
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          if (!hapus) return;
          setBusy(true);
          const res = await deletePolis(hapus.id);
          setBusy(false);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Polis dihapus");
          setHapus(null);
        }}
      />
      <LoadingOverlay message={busy ? "Menghapus polis…" : null} />
    </Modal>
  );
}
