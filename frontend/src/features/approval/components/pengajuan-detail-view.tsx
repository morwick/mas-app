import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/utils";
import {
  MODE_LABEL,
  putuskanPengajuan,
  STATUS_PENGAJUAN_LABEL,
  type LangkahApproval,
  type PengajuanApproval,
  type StatusPengajuan
} from "../api";

const WARNA_STATUS: Record<StatusPengajuan, { bg: string; fg: string }> = {
  menunggu: { bg: "var(--status-menunggu-bg)", fg: "var(--status-menunggu-text)" },
  disetujui: { bg: "var(--status-selesai-bg)", fg: "var(--status-selesai-text)" },
  ditolak: { bg: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-text)" },
  dibatalkan: { bg: "var(--bg-muted)", fg: "var(--text-secondary)" }
};

export function StatusBadge({ status }: { status: StatusPengajuan }) {
  const w = WARNA_STATUS[status];
  return (
    <span className="badge" style={{ background: w.bg, color: w.fg }}>
      {STATUS_PENGAJUAN_LABEL[status]}
    </span>
  );
}

interface Props {
  p: PengajuanApproval;
  namaFitur: string;
}

/**
 * Halaman detail satu pengajuan: ringkasan, rincian, alur approval, dan —
 * bila sedang giliran pengguna ini — kotak keputusan (Tolak / Setujui).
 * Setelah diputuskan kembali ke daftar approval fitur itu.
 */
export function PengajuanDetailView({ p, namaFitur }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Keputusan yang menunggu konfirmasi "Apakah Anda yakin?" (null = tidak ada).
  const [konfirmasi, setKonfirmasi] = useState<boolean | null>(null);
  // Penjaga klik ganda yang langsung berlaku, sebelum state `busy` sempat dirender.
  const sedangSimpan = useRef(false);
  // Kembali ke tab "Menunggu saya" di daftar approval fitur ini.
  const kembali = `/approval/${p.fitur_kode}?tab=menunggu`;

  /** Tombol Tolak / Setujui: cek isian dulu, lalu minta konfirmasi. */
  function minta(setuju: boolean) {
    if (busy) return;
    // BATASAN: menolak wajib disertai alasan (dijaga juga backend & database).
    if (!setuju && !catatan.trim()) {
      toast.error("Alasan penolakan wajib diisi.");
      return;
    }
    setKonfirmasi(setuju);
  }

  async function putuskan(setuju: boolean) {
    // Popup loading menutup seluruh layar sampai selesai — mencegah klik ganda.
    if (sedangSimpan.current) return;
    sedangSimpan.current = true;
    setKonfirmasi(null);
    setBusy(setuju ? "Menyimpan persetujuan…" : "Menyimpan penolakan…");
    const res = await putuskanPengajuan(p.id, setuju, catatan.trim() || null);
    if (!res.ok) {
      sedangSimpan.current = false;
      setBusy(null);
      toast.error(res.error);
      return;
    }
    const hasil = res.data.status_approval;
    toast.success(
      hasil === "menunggu"
        ? "Keputusan tersimpan — menunggu approver berikutnya"
        : `Pengajuan ${STATUS_PENGAJUAN_LABEL[hasil].toLowerCase()}`
    );
    // Loading tetap tampil sampai pindah halaman (data daftar sudah dimuat ulang).
    navigate(kembali, { replace: true });
  }

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 820 }}>
      <div>
        <Link to={kembali} className="caption" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft style={{ width: 13, height: 13 }} /> Approval {namaFitur}
        </Link>
      </div>

      <div className="card card-pad-lg">
        <h1 className="h1" style={{ margin: 0 }}>
          {p.judul}
        </h1>
        <div className="caption" style={{ marginTop: 4 }}>
          Diajukan {p.diajukan_oleh_nama ?? "—"} · {formatDateTime(p.diajukan_at)}
        </div>
        <div style={{ marginTop: 16 }}>
          <DetailPengajuan p={p} />
        </div>
      </div>

      {p.giliran_saya && (
        <div className="card card-pad-lg">
          <div className="h3" style={{ marginBottom: 10 }}>
            Keputusan Anda
          </div>
          <Field label="Catatan / alasan" hint="Wajib diisi bila menolak.">
            <Textarea
              maxLength={500}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="mis. Nominal sesuai kebutuhan / Nominal terlalu besar"
            />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Button
              variant="danger"
              leftIcon={<X style={{ width: 14, height: 14 }} />}
              onClick={() => minta(false)}
              disabled={busy !== null}
            >
              Tolak
            </Button>
            <Button
              leftIcon={<Check style={{ width: 14, height: 14 }} />}
              onClick={() => minta(true)}
              disabled={busy !== null}
            >
              Setujui
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={konfirmasi !== null}
        onClose={() => setKonfirmasi(null)}
        onConfirm={() => konfirmasi !== null && putuskan(konfirmasi)}
        title={konfirmasi ? "Setujui pengajuan ini?" : "Tolak pengajuan ini?"}
        body={
          <>
            Apakah Anda yakin {konfirmasi ? "menyetujui" : "menolak"} <strong>{p.judul}</strong>? Keputusan tidak bisa
            diubah setelah disimpan.
          </>
        }
        confirmText={konfirmasi ? "Ya, setujui" : "Ya, tolak"}
        cancelText="Batal"
        variant={konfirmasi ? "primary" : "danger"}
        loading={busy !== null}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}

/** Detail satu pengajuan: ringkasan, rincian data, dan alur approval. */
function DetailPengajuan({ p }: { p: PengajuanApproval }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderRadius: 10,
          background: "var(--bg-subtle)"
        }}
      >
        <StatusBadge status={p.status_approval} />
        {p.nilai != null && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="caption">Nilai pengajuan</div>
            <strong className="mono" style={{ fontSize: 18 }}>
              {formatRupiah(p.nilai)}
            </strong>
          </div>
        )}
      </div>

      <section>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Rincian pengajuan
        </div>
        <RincianPengajuan p={p} />
      </section>

      {/* Daftar approver selalu tampil — walau hanya satu approver. */}
      {p.langkah.length > 0 && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Approver · {MODE_LABEL[p.mode]}
          </div>
          <DaftarApprover langkah={p.langkah} berjenjang={p.mode === "berjenjang"} />
        </section>
      )}

      <CatatanApprover p={p} />
    </div>
  );
}

/** Nominal rupiah dicetak tebal supaya approver jeli. */
function Nominal({ nilai }: { nilai: string | number | null | undefined }) {
  if (nilai == null || nilai === "") return <>—</>;
  return (
    <strong className="mono" style={{ fontSize: 14 }}>
      {formatRupiah(Number(nilai))}
    </strong>
  );
}

/** Rute tersimpan sebagai "asal → tujuan" (migration 20261001000010). */
function pisahRute(rute: unknown): [string, string] {
  const teks = typeof rute === "string" ? rute : "";
  const i = teks.indexOf(" → ");
  if (i < 0) return [teks.trim() || "—", "—"];
  return [teks.slice(0, i).trim() || "—", teks.slice(i + 3).trim() || "—"];
}

/** Rincian data yang diajukan — isi berbeda per fitur (lihat migration 20261001000010). */
function RincianPengajuan({ p }: { p: PengajuanApproval }) {
  const r = p.rincian as Record<string, string | number | null | undefined>;
  const aset = r.jenis_aset === "unit" ? "Unit" : "Unit trailer";
  const baris: [string, React.ReactNode][] =
    p.fitur_kode === "tambahan_uang_jalan"
      ? [
          [
            "Job",
            // Tautan di detail approval dibuka di tab baru supaya halaman keputusan tetap terbuka.
            r.job_id ? (
              <Link to={`/jobs/${r.job_id}`} target="_blank" rel="noopener noreferrer">
                {String(r.job_number ?? "")}
              </Link>
            ) : (
              String(r.job_number ?? "—")
            )
          ],
          ["Driver", r.driver ?? "—"],
          // Asal & tujuan berdampingan dalam satu baris (grid 2 kolom).
          ["Asal", pisahRute(r.rute)[0]],
          ["Tujuan", pisahRute(r.rute)[1]],
          // Total = awal + tambahan sebelumnya yang sudah disetujui (dihitung terkini
          // di database, migration 20261001000019). Belum pernah ada tambahan yang
          // disetujui → cukup uang jalan awal.
          ["Uang jalan awal", <Nominal key="awal" nilai={r.uang_jalan_awal} />],
          ...(Number(r.tambahan_disetujui ?? 0) > 0
            ? ([
                ["Tambahan sudah disetujui", <Nominal key="tambah" nilai={r.tambahan_disetujui} />],
                [
                  "Total uang jalan untuk job ini",
                  <Nominal key="total" nilai={Number(r.uang_jalan_awal ?? 0) + Number(r.tambahan_disetujui)} />
                ]
              ] as [string, React.ReactNode][])
            : []),
          ["Tanggal", r.tanggal ? formatDate(String(r.tanggal)) : "—"],
          ["Keperluan", r.keperluan ?? "—"],
          ["Catatan", r.catatan ?? "—"]
        ]
      : p.fitur_kode === "penjualan_aset"
        ? [
            [aset, r.kode_aset ?? "—"],
            ["Pembeli", r.nama_pembeli ?? "—"],
            ["Harga jual", <Nominal key="jual" nilai={r.harga_jual} />],
            ["Tanggal jual", r.tanggal_jual ? formatDate(String(r.tanggal_jual)) : "—"],
            ["Nomor surat", r.nomor_surat ?? "—"],
            ["Catatan", r.catatan ?? "—"]
          ]
        : [
            [aset, r.kode_aset ?? "—"],
            ["Tanggal hapus", r.tanggal_hapus ? formatDate(String(r.tanggal_hapus)) : "—"],
            ["Alasan", r.alasan ?? "—"],
            ["Nomor berita acara", r.nomor_berita_acara ?? "—"],
            ["Catatan", r.catatan ?? "—"]
          ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "12px 20px" }}>
      {baris.map(([label, nilai]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 500, wordBreak: "break-word" }}>{nilai}</div>
        </div>
      ))}
    </div>
  );
}

const LABEL_KEPUTUSAN: Record<LangkahApproval["keputusan"], string> = {
  menunggu: "Menunggu",
  setuju: "Setuju",
  tolak: "Tolak",
  dilewati: "Dilewati"
};

const IKON_KEPUTUSAN: Record<LangkahApproval["keputusan"], string> = {
  menunggu: "⏳",
  setuju: "✓",
  tolak: "✗",
  dilewati: "–"
};

/**
 * Status satu approver: "Setuju · 01 Okt 2026, 08.00", "Tolak · …", atau
 * "Menunggu". Approver yang belum memutuskan tetap "Menunggu" walau pengajuan
 * sudah selesai karena approver lain (keputusan "dilewati").
 */
function StatusApprover({ l: asli }: { l: LangkahApproval }) {
  const l: LangkahApproval = asli.keputusan === "dilewati" ? { ...asli, keputusan: "menunggu" } : asli;
  const warna =
    l.keputusan === "setuju"
      ? { bg: "var(--status-selesai-bg)", fg: "var(--status-selesai-text)" }
      : l.keputusan === "tolak"
        ? { bg: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-text)" }
        : { bg: "var(--status-menunggu-bg)", fg: "var(--status-menunggu-text)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="badge" style={{ background: warna.bg, color: warna.fg }}>
        {IKON_KEPUTUSAN[l.keputusan]} {LABEL_KEPUTUSAN[l.keputusan]}
      </span>
      {(l.keputusan === "setuju" || l.keputusan === "tolak") && l.diputuskan_at && (
        <span className="caption mono">{formatDateTime(l.diputuskan_at)}</span>
      )}
    </div>
  );
}

/** Daftar approver: nama, level (mode berjenjang), status & waktu keputusan. */
export function DaftarApprover({ langkah, berjenjang }: { langkah: LangkahApproval[]; berjenjang: boolean }) {
  return (
    <div style={{ border: "0.5px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nama</th>
              {berjenjang && <th style={{ width: 80 }}>Level</th>}
              <th style={{ width: 260 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {langkah.map((l) => (
              <tr key={l.karyawan_id}>
                <td style={{ fontWeight: 600, fontSize: 13.5 }}>{l.nama}</td>
                {berjenjang && <td style={{ fontSize: 13 }}>Level {l.urutan}</td>}
                <td>
                  <StatusApprover l={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Catatan approver di bawah daftar approver: persetujuan (hijau, hanya bila
 * diisi) dan penolakan (merah), urut sesuai daftar approver. BATASAN: menolak
 * wajib disertai alasan (dijaga form, backend & database), jadi pengajuan yang
 * ditolak selalu punya catatan.
 */
export function CatatanApprover({ p }: { p: Pick<PengajuanApproval, "langkah" | "alasan_tolak"> }) {
  const bercatatan = p.langkah.filter((l) => (l.keputusan === "setuju" || l.keputusan === "tolak") && l.catatan);
  const adaTolak = bercatatan.some((l) => l.keputusan === "tolak");
  // Data lama: alasan tolak tersimpan di pengajuan, tidak di langkah approver.
  const alasanLama = !adaTolak && p.alasan_tolak ? p.alasan_tolak : null;
  if (bercatatan.length === 0 && !alasanLama) return null;

  const gaya = (setuju: boolean): React.CSSProperties => ({
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 8,
    background: setuju ? "var(--status-selesai-bg)" : "var(--status-cancelled-bg)",
    color: setuju ? "var(--status-selesai-text)" : "var(--status-cancelled-text)"
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {bercatatan.map((l) => (
        <div key={l.karyawan_id} style={gaya(l.keputusan === "setuju")}>
          <strong>
            Catatan {l.keputusan === "setuju" ? "persetujuan" : "penolakan"} {l.nama}:
          </strong>{" "}
          {l.catatan}
        </div>
      ))}
      {alasanLama && (
        <div style={gaya(false)}>
          <strong>Catatan penolakan:</strong> {alasanLama}
        </div>
      )}
    </div>
  );
}
