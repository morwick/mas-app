import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileText,
  Pause,
  Pencil,
  Phone,
  Play,
  Trash2,
  Upload,
  CalendarClock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cekFileDokumen } from "@/components/ui/dokumen-input";
import { DateInput } from "@/components/ui/date-input";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { tautanWhatsApp } from "@/lib/server-page";
import { formatDate, formatRupiah, hariIniWIB } from "@/lib/utils";
import { DetailField } from "@/features/units/components/aset-detail-parts";
import {
  JENIS_FOTO,
  JENIS_WO,
  PELAKSANA,
  PRIORITAS,
  STATUS_KLAIM,
  STATUS_WO,
  SUMBER_WO,
  deleteFotoPerintahKerja,
  deletePerintahKerja,
  labelDari,
  ubahStatusPerintahKerja,
  uploadFotoPerintahKerja,
  type JenisFoto,
  type PerintahKerja,
  type StatusWo
} from "../api";
import { StatusWoBadge } from "./daftar-perintah-kerja";
import { RingkasanBiaya } from "./perintah-kerja-form";

interface AksiStatus {
  ke: StatusWo;
  label: string;
  ikon: React.ReactNode;
  utama?: boolean;
}

function aksiStatus(w: PerintahKerja): AksiStatus[] {
  const kerjakan = { ke: "dikerjakan" as const, label: "Mulai dikerjakan", ikon: <Play className="w-3.5 h-3.5" />, utama: true };
  const selesai = { ke: "selesai" as const, label: "Selesai", ikon: <CheckCircle2 className="w-3.5 h-3.5" />, utama: true };
  switch (w.status_wo) {
    case "draft":
      return [{ ke: "dijadwalkan", label: "Jadwalkan", ikon: <CalendarClock className="w-3.5 h-3.5" /> }, kerjakan];
    case "dijadwalkan":
      return [kerjakan];
    case "dikerjakan":
      return [
        { ke: "menunggu_sparepart", label: "Menunggu sparepart", ikon: <Pause className="w-3.5 h-3.5" /> },
        ...(w.pelaksana === "asuransi"
          ? [{ ke: "menunggu_asuransi" as const, label: "Menunggu asuransi", ikon: <Pause className="w-3.5 h-3.5" /> }]
          : []),
        selesai
      ];
    case "menunggu_sparepart":
    case "menunggu_asuransi":
      return [{ ...kerjakan, label: "Lanjut dikerjakan", utama: false }, selesai];
    default:
      return [];
  }
}

export function PerintahKerjaDetail({ wo }: { wo: PerintahKerja }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [selesaiOpen, setSelesaiOpen] = useState(false);
  const [batalOpen, setBatalOpen] = useState(false);
  const [hapusOpen, setHapusOpen] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [tglSelesai, setTglSelesai] = useState(hariIniWIB());
  const [odometer, setOdometer] = useState(wo.odometer_km != null ? String(wo.odometer_km) : "");
  const [jenisFoto, setJenisFoto] = useState<JenisFoto>("sebelum");
  const fileRef = useRef<HTMLInputElement>(null);

  const final = wo.status_wo === "selesai" || wo.status_wo === "dibatalkan";
  const bisaHapus = ["draft", "dijadwalkan", "dibatalkan"].includes(wo.status_wo);
  const asetHref = wo.jenis_aset === "unit" ? `/units/${wo.aset_id}` : `/unit-trailer/${wo.aset_id}`;

  async function jalankan(pesan: string, aksi: () => Promise<{ ok: boolean; error?: string }>, sukses: string) {
    setBusy(pesan);
    const res = await aksi();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal");
      return false;
    }
    toast.success(sukses);
    return true;
  }

  async function ubahStatus(ke: StatusWo) {
    if (ke === "selesai") {
      setSelesaiOpen(true);
      return;
    }
    await jalankan(
      "Mengubah status…",
      () => ubahStatusPerintahKerja(wo.id, { status_wo: ke }),
      `Status diubah: ${STATUS_WO[ke].label}`
    );
  }

  async function unggah(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const salah = cekFileDokumen(file);
    if (salah) {
      toast.error(salah);
      return;
    }
    await jalankan("Mengunggah file…", () => uploadFotoPerintahKerja(wo.id, jenisFoto, file), "File diunggah");
  }

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="card card-pad-lg">
          <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 14 }}>
            <div className="flex gap-3">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: "var(--brand-primary-light)",
                  color: "var(--brand-primary-dark)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <ClipboardList style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="h1 mono" style={{ fontSize: 20 }}>
                    {wo.nomor}
                  </div>
                  <StatusWoBadge status={wo.status_wo} />
                </div>
                <div className="body-sm muted">
                  <Link to={asetHref} style={{ fontWeight: 600 }}>
                    {wo.kode_aset}
                  </Link>{" "}
                  · {labelDari(JENIS_WO, wo.jenis)} · {formatDate(wo.tanggal)}
                </div>
              </div>
            </div>
            {canManageOperational && (
              <div className="flex gap-2 flex-wrap">
                {aksiStatus(wo).map((a) => (
                  <Button
                    key={a.ke}
                    size="sm"
                    variant={a.utama ? "primary" : "secondary"}
                    leftIcon={a.ikon}
                    onClick={() => ubahStatus(a.ke)}
                  >
                    {a.label}
                  </Button>
                ))}
                {wo.status_wo !== "dibatalkan" && (
                  <Link to={`/perintah-kerja/${wo.id}/edit`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                    <Pencil style={{ width: 14, height: 14 }} />
                    Edit
                  </Link>
                )}
                {!final && (
                  <Button size="sm" variant="ghost" leftIcon={<Ban className="w-3.5 h-3.5" />} onClick={() => setBatalOpen(true)}>
                    Batalkan
                  </Button>
                )}
                {bisaHapus && (
                  <Button size="sm" variant="ghost" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setHapusOpen(true)}>
                    Hapus
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="divider" style={{ marginBottom: 14 }} />
          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 16 }}>
            <DetailField label="Sumber" value={labelDari(SUMBER_WO, wo.sumber)} />
            <DetailField label="Prioritas" value={labelDari(PRIORITAS, wo.prioritas)} />
            <DetailField
              label="Insiden"
              valueNode={
                wo.incident_id ? (
                  <Link to={`${asetHref}?tab=insiden`} style={{ fontWeight: 500 }}>
                    Lihat insiden
                  </Link>
                ) : undefined
              }
              value={wo.incident_id ? undefined : "—"}
            />
            <DetailField label="Jadwal mulai" value={wo.jadwal_mulai ? formatDate(wo.jadwal_mulai) : "—"} />
            <DetailField label="Estimasi selesai" value={wo.estimasi_selesai ? formatDate(wo.estimasi_selesai) : "—"} />
            <DetailField label="Tanggal selesai" value={wo.tanggal_selesai ? formatDate(wo.tanggal_selesai) : "—"} />
            {wo.jenis_aset === "unit" && (
              <DetailField
                label="Odometer"
                value={wo.odometer_km != null ? `${new Intl.NumberFormat("id-ID").format(wo.odometer_km)} km` : "—"}
              />
            )}
          </div>
          {(wo.keluhan || wo.diagnosa || wo.catatan || wo.alasan_batal) && (
            <>
              <div className="divider" style={{ margin: "14px 0" }} />
              <div className="flex flex-col gap-3">
                {wo.keluhan && <DetailField label="Keluhan / kerusakan" value={wo.keluhan} fullWidth />}
                {wo.diagnosa && <DetailField label="Diagnosa" value={wo.diagnosa} fullWidth />}
                {wo.catatan && <DetailField label="Catatan" value={wo.catatan} fullWidth />}
                {wo.alasan_batal && <DetailField label="Alasan pembatalan" value={wo.alasan_batal} fullWidth />}
              </div>
            </>
          )}
        </div>

        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            Rincian biaya
          </div>
          {wo.jasa.length + wo.sparepart.length + wo.biaya_lain.length === 0 ? (
            <p className="caption">Belum ada rincian biaya.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Uraian</th>
                    <th>Keterangan</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.jasa.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <span className="caption">Jasa · </span>
                        {j.uraian}
                      </td>
                      <td className="caption">
                        {[j.mekanik_nama, j.jam_kerja != null ? `${j.jam_kerja} jam` : null].filter(Boolean).join(" · ") ||
                          "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(j.biaya)}</td>
                    </tr>
                  ))}
                  {wo.sparepart.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="caption">Sparepart · </span>
                        {p.nama}
                        {p.kode && <span className="caption mono"> ({p.kode})</span>}
                      </td>
                      <td className="caption">
                        {new Intl.NumberFormat("id-ID").format(p.qty)} {p.satuan ?? ""} × {formatRupiah(p.harga_satuan)}
                        {p.keterangan ? ` · ${p.keterangan}` : ""}
                      </td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(p.subtotal)}</td>
                    </tr>
                  ))}
                  {wo.biaya_lain.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <span className="caption">Lain-lain · </span>
                        {b.uraian}
                      </td>
                      <td className="caption">—</td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(b.biaya)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="divider" style={{ margin: "12px 0" }} />
          <RingkasanBiaya
            jasa={wo.total_jasa}
            sparepart={wo.total_sparepart}
            lain={wo.total_lain}
            pelaksana={wo.pelaksana}
            asuransi={wo.tanggungan.asuransi}
            perusahaan={wo.tanggungan.perusahaan}
            estimasi={wo.tanggungan.estimasi}
          />
        </div>

        <div className="card card-pad">
          <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 12 }}>
            <div className="h3">Foto & dokumen</div>
            {canManageOperational && (
              <div className="flex items-center gap-2">
                <Select value={jenisFoto} onChange={(e) => setJenisFoto(e.target.value as JenisFoto)} aria-label="Jenis file">
                  {(Object.keys(JENIS_FOTO) as JenisFoto[]).map((j) => (
                    <option key={j} value={j}>
                      {JENIS_FOTO[j]}
                    </option>
                  ))}
                </Select>
                <Button size="sm" leftIcon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileRef.current?.click()}>
                  Upload
                </Button>
                <input ref={fileRef} type="file" accept=".pdf,image/*" hidden onChange={unggah} />
              </div>
            )}
          </div>
          {wo.foto.length === 0 ? (
            <p className="caption">Belum ada foto atau dokumen (PDF / JPG / PNG / WEBP, maks. 10 MB).</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10 }}>
              {wo.foto.map((f) => (
                <div key={f.id} style={{ border: "0.5px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                  <a href={f.url ?? "#"} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                    {f.content_type?.startsWith("image/") && f.url ? (
                      <img src={f.url} alt={JENIS_FOTO[f.jenis]} style={{ width: "100%", height: 110, objectFit: "cover" }} />
                    ) : (
                      <div
                        className="flex items-center justify-center"
                        style={{ height: 110, background: "var(--bg-subtle)" }}
                      >
                        <FileText style={{ width: 28, height: 28, color: "var(--text-tertiary)" }} />
                      </div>
                    )}
                  </a>
                  <div className="flex items-center justify-between gap-1" style={{ padding: "6px 8px" }}>
                    <span className="caption" style={{ fontSize: 11 }}>
                      {JENIS_FOTO[f.jenis]}
                    </span>
                    {canManageOperational && (
                      <button
                        type="button"
                        aria-label="Hapus file"
                        onClick={() =>
                          jalankan("Menghapus file…", () => deleteFotoPerintahKerja(wo.id, f.id), "File dihapus")
                        }
                        style={{ border: "none", background: "none", cursor: "pointer" }}
                      >
                        <Trash2 style={{ width: 13, height: 13, color: "var(--text-tertiary)" }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 4 }}>
            Pelaksana
          </div>
          <div className="caption" style={{ marginBottom: 12 }}>
            {labelDari(PELAKSANA, wo.pelaksana)}
          </div>
          {wo.pelaksana === "internal" && (
            <div className="flex flex-col gap-1" style={{ fontSize: 13 }}>
              {wo.mekanik.map((m) => (
                <div key={m.id} className="flex justify-between gap-2">
                  <span>{m.nama}</span>
                  {m.is_penanggung_jawab && <span className="badge badge-status-standby">Penanggung jawab</span>}
                </div>
              ))}
            </div>
          )}
          {wo.pelaksana === "bengkel" && (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{wo.pelaksana_nama ?? "—"}</div>
              {wo.no_nota && <div className="caption">No. nota: {wo.no_nota}</div>}
            </div>
          )}
          {wo.pelaksana === "asuransi" && wo.polis && (
            <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
              <div>
                <Link to={`/asuransi/${wo.polis.asuransi_id}`} style={{ fontWeight: 600 }}>
                  {wo.polis.asuransi_nama}
                </Link>
                <div className="caption">
                  Polis <span className="mono">{wo.polis.nomor_polis}</span> · s/d {formatDate(wo.polis.berakhir)}
                </div>
              </div>
              {wo.bengkel_rekanan_nama && <div className="caption">Bengkel rekanan: {wo.bengkel_rekanan_nama}</div>}
              {wo.klaim && (
                <div
                  className="flex flex-col gap-1"
                  style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: 10, marginTop: 4 }}
                >
                  <div className="flex justify-between">
                    <span className="caption">Status klaim</span>
                    <strong>{STATUS_KLAIM[wo.klaim.status_klaim]}</strong>
                  </div>
                  {wo.klaim.nomor_klaim && (
                    <div className="flex justify-between">
                      <span className="caption">No. klaim</span>
                      <span className="mono">{wo.klaim.nomor_klaim}</span>
                    </div>
                  )}
                  {wo.klaim.tanggal_pengajuan && (
                    <div className="flex justify-between">
                      <span className="caption">Diajukan</span>
                      <span>{formatDate(wo.klaim.tanggal_pengajuan)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="caption">Nilai diajukan</span>
                    <span>{wo.klaim.nilai_diajukan != null ? formatRupiah(wo.klaim.nilai_diajukan) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="caption">Nilai disetujui</span>
                    <span>{wo.klaim.nilai_disetujui != null ? formatRupiah(wo.klaim.nilai_disetujui) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="caption">Own risk</span>
                    <span>{wo.klaim.own_risk != null ? formatRupiah(wo.klaim.own_risk) : "—"}</span>
                  </div>
                  {wo.klaim.catatan && <div className="caption">{wo.klaim.catatan}</div>}
                </div>
              )}
              {(wo.klaim?.pic ?? wo.polis.pic_utama) &&
                (() => {
                  const pic = (wo.klaim?.pic ?? wo.polis.pic_utama)!;
                  const wa = tautanWhatsApp(pic.no_hp);
                  return (
                    <div>
                      <div className="caption">PIC asuransi</div>
                      <div style={{ fontWeight: 600 }}>{pic.nama}</div>
                      <a
                        href={wa ?? `tel:${pic.no_hp}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono inline-flex items-center gap-1"
                        style={{ color: "var(--brand-primary-dark)" }}
                      >
                        <Phone style={{ width: 12, height: 12 }} />
                        {pic.no_hp}
                      </a>
                    </div>
                  );
                })()}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={selesaiOpen}
        onClose={busy ? () => {} : () => setSelesaiOpen(false)}
        title={`Selesaikan ${wo.nomor}?`}
        description={
          wo.incident_id
            ? "Aset kembali Standby / Bertugas dan insiden terkait ditandai Selesai dengan biaya perbaikan dari perintah kerja ini."
            : "Aset kembali Standby / Bertugas (kecuali masih ada insiden terbuka)."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelesaiOpen(false)} disabled={busy !== null}>
              Batal
            </Button>
            <Button
              loading={busy !== null}
              onClick={async () => {
                const ok = await jalankan(
                  "Menyelesaikan perintah kerja…",
                  () =>
                    ubahStatusPerintahKerja(wo.id, {
                      status_wo: "selesai",
                      tanggal_selesai: tglSelesai || null,
                      odometer_km: wo.jenis_aset === "unit" && odometer.trim() ? Number(odometer.replace(",", ".")) : null
                    }),
                  "Perintah kerja selesai"
                );
                if (ok) setSelesaiOpen(false);
              }}
            >
              Ya, selesai
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Tanggal selesai">
            <DateInput value={tglSelesai} onChange={setTglSelesai} />
          </Field>
          {wo.jenis_aset === "unit" && (
            <Field label="Odometer saat selesai (km)" hint="Dipakai menghitung jadwal servis berikutnya">
              <Input inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
            </Field>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={batalOpen}
        onClose={() => setBatalOpen(false)}
        title={`Batalkan ${wo.nomor}?`}
        body={
          <Field label="Alasan pembatalan">
            <Textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Wajib diisi" />
          </Field>
        }
        confirmText="Ya, batalkan"
        variant="danger"
        loading={busy !== null}
        onConfirm={async () => {
          if (!alasan.trim()) {
            toast.error("Alasan pembatalan wajib diisi");
            return;
          }
          const ok = await jalankan(
            "Membatalkan perintah kerja…",
            () => ubahStatusPerintahKerja(wo.id, { status_wo: "dibatalkan", alasan_batal: alasan.trim() }),
            "Perintah kerja dibatalkan"
          );
          if (ok) setBatalOpen(false);
        }}
      />
      <ConfirmDialog
        open={hapusOpen}
        onClose={() => setHapusOpen(false)}
        title={`Hapus ${wo.nomor}?`}
        body="Perintah kerja yang sudah berjalan atau selesai tidak bisa dihapus."
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
        onConfirm={async () => {
          const ok = await jalankan("Menghapus perintah kerja…", () => deletePerintahKerja(wo.id), "Perintah kerja dihapus");
          if (ok) navigate("/services?tab=perintah-kerja");
        }}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}
