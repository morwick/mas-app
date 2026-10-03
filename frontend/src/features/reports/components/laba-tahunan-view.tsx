import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";
import { Select } from "@/components/ui/input";
import type { LabaBulanRow, LabaTahunan } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";

interface Props {
  data: LabaTahunan;
  /** Pilihan tahun di dropdown (terbaru dulu). */
  pilihanTahun: number[];
}

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const NAMA_BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// Warna seri grafik (palet kategorikal tervalidasi: beda jelas juga bagi buta warna).
const WARNA_OMSET = "#2a78d6";
const WARNA_BIAYA = "#eb6834";
const MERAH = "#C13838";
const HIJAU = "var(--status-selesai-text)";

/** Angka minus di rincian berwarna merah. */
const warnaMinus = (n: number) => (n < 0 ? MERAH : undefined);
/** Margin: minus merah, plus hijau, kosong (tanpa omset) netral. */
const warnaMargin = (m: number | null) => (m === null ? undefined : m < 0 ? MERAH : m > 0 ? HIJAU : undefined);

const totalBiaya = (r: LabaBulanRow) => r.uang_jalan + r.biaya_lainnya;

const formatRingkas = (n: number) =>
  new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** "40% dari omset" — kosong bila omset nol. */
const persenDariOmset = (nilai: number, omset: number) =>
  omset ? `${Math.round((nilai / omset) * 1000) / 10}% dari omset · di luar PPN`.replace(".", ",") : "di luar PPN";

const formatMargin = (m: number | null) =>
  m === null ? "—" : `${m.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

/**
 * Laba setahun dirinci per bulan.
 *
 * BATASAN: dasarnya tagihan — omset dan seluruh biaya proyek yang ditagih
 * (uang jalan, biaya lainnya) jatuh di bulan tanggal tagihan, bukan
 * tanggal transaksinya. Pekerjaan yang belum ditagih tidak masuk tabel; yang
 * sudah selesai ditampilkan terpisah di bawah.
 */
export function LabaTahunanView({ data, pilihanTahun }: Props) {
  const [sp, setSp] = useSearchParams();
  const rows = data.bulan;

  const total = rows.reduce(
    (acc, r) => ({
      tagihan: acc.tagihan + r.jumlah_tagihan,
      omset: acc.omset + r.omset,
      dibayar: acc.dibayar + r.dibayar,
      uang_jalan: acc.uang_jalan + r.uang_jalan,
      lainnya: acc.lainnya + r.biaya_lainnya,
      profit: acc.profit + r.profit
    }),
    { tagihan: 0, omset: 0, dibayar: 0, uang_jalan: 0, lainnya: 0, profit: 0 }
  );
  const marginTotal = total.omset ? Math.round((total.profit / total.omset) * 1000) / 10 : null;

  function gantiTahun(tahun: string) {
    const next = new URLSearchParams(sp);
    next.set("tahun", tahun);
    setSp(next, { replace: true });
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="card card-pad flex flex-wrap items-end" style={{ gap: 12 }}>
        <label className="flex flex-col" style={{ gap: 4 }}>
          <span className="eyebrow">Tahun</span>
          <Select
            value={String(data.tahun)}
            onChange={(e) => gantiTahun(e.target.value)}
            aria-label="Tahun laporan"
            style={{ width: 120 }}
          >
            {pilihanTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        <p className="caption" style={{ flex: "1 1 320px", color: "var(--text-tertiary)", margin: 0 }}>
          Dihitung dari tagihan (termasuk draft, kecuali yang batal) menurut tanggal tagihan. Job yang jalan
          Desember tapi ditagih Januari masuk Januari, beserta uang jalan & biaya lainnya. Semua angka di luar PPN.
          Biaya lainnya = Biaya Lain yang dicatat di detail job. Proyek kosongan (tanpa customer) tidak ditagih, tapi
          uang jalan & biaya lainnya ikut dihitung di bulan tanggal bongkarnya (setelah semua job bongkar).
          Ini laba operasional pekerjaan, belum termasuk gaji, cicilan, dan biaya kantor.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard label="Omset" value={formatRupiah(total.omset)} />
        <StatCard label="Uang jalan" value={formatRupiah(total.uang_jalan)} />
        <StatCard label="Biaya lainnya" value={formatRupiah(total.lainnya)} />
        <StatCard
          label="Profit"
          value={formatRupiah(total.profit)}
          color={total.profit < 0 ? MERAH : "var(--brand-primary-dark)"}
        />
        <StatCard label="Margin" value={formatMargin(marginTotal)} color={warnaMargin(marginTotal)} />
      </div>

      {/* Pembayaran tagihan setahun — di luar PPN, sama dengan dasar omset. */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <StatCard
          label="Tagihan sudah dibayar"
          value={formatRupiah(total.dibayar)}
          keterangan={persenDariOmset(total.dibayar, total.omset)}
        />
        <StatCard
          label="Tagihan belum dibayar"
          value={formatRupiah(total.omset - total.dibayar)}
          keterangan={persenDariOmset(total.omset - total.dibayar, total.omset)}
        />
      </div>

      <BelumDitagih data={data.belum_ditagih} />

      <GrafikBulanan rows={rows} />

      <div className="card">
        <div className="card-header">
          <p className="eyebrow">Rincian per bulan · {data.tahun}</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Bulan</th>
                <th style={{ width: 80, textAlign: "right" }}>Tagihan</th>
                <th style={{ textAlign: "right" }}>Omset</th>
                <th style={{ textAlign: "right" }}>Uang jalan</th>
                <th style={{ textAlign: "right" }}>Biaya lainnya</th>
                <th style={{ textAlign: "right" }}>Profit</th>
                <th style={{ width: 80, textAlign: "right" }}>Margin</th>
                <th style={{ textAlign: "right" }}>Sudah dibayar</th>
                <th style={{ textAlign: "right" }}>Belum dibayar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // Bulan tanpa tagihan tapi ada proyek kosongan tetap menampilkan biayanya.
                const kosong = r.jumlah_tagihan === 0 && r.jumlah_kosongan === 0;
                return (
                  <tr key={r.bulan} style={kosong ? { color: "var(--text-tertiary)" } : undefined}>
                    <td style={{ fontSize: 13 }}>{NAMA_BULAN_PANJANG[r.bulan - 1]}</td>
                    <Angka>
                      {r.jumlah_tagihan ? (
                        <TautanAngka to={tautanTagihan(data.tahun, r.bulan)}>{r.jumlah_tagihan}</TautanAngka>
                      ) : (
                        "—"
                      )}
                    </Angka>
                    <Angka>
                      {kosong ? (
                        "—"
                      ) : r.jumlah_tagihan ? (
                        <TautanAngka to={tautanTagihan(data.tahun, r.bulan)} color={warnaMinus(r.omset)}>
                          {formatRupiah(r.omset)}
                        </TautanAngka>
                      ) : (
                        formatRupiah(r.omset)
                      )}
                    </Angka>
                    <Angka color={kosong ? undefined : warnaMinus(r.uang_jalan)}>
                      {kosong ? "—" : formatRupiah(r.uang_jalan)}
                      <RincianKosongan nilai={r.uang_jalan_kosongan} />
                    </Angka>
                    <Angka color={kosong ? undefined : warnaMinus(r.biaya_lainnya)}>
                      {kosong ? "—" : formatRupiah(r.biaya_lainnya)}
                      <RincianKosongan nilai={r.biaya_lainnya_kosongan} />
                    </Angka>
                    <Angka bold color={kosong ? undefined : r.profit < 0 ? MERAH : "var(--brand-primary-dark)"}>
                      {kosong ? "—" : formatRupiah(r.profit)}
                    </Angka>
                    <Angka bold color={warnaMargin(r.margin)}>
                      {formatMargin(r.margin)}
                    </Angka>
                    <Angka color={kosong ? undefined : warnaMinus(r.dibayar)}>{kosong ? "—" : formatRupiah(r.dibayar)}</Angka>
                    <Angka color={kosong ? undefined : warnaMinus(r.omset - r.dibayar)}>
                      {kosong ? "—" : formatRupiah(r.omset - r.dibayar)}
                    </Angka>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg-subtle, #F7F8F6)" }}>
                <td style={{ fontSize: 13, fontWeight: 700 }}>Total</td>
                <Angka bold>{total.tagihan}</Angka>
                <Angka bold color={warnaMinus(total.omset)}>
                  {formatRupiah(total.omset)}
                </Angka>
                <Angka bold color={warnaMinus(total.uang_jalan)}>
                  {formatRupiah(total.uang_jalan)}
                </Angka>
                <Angka bold color={warnaMinus(total.lainnya)}>
                  {formatRupiah(total.lainnya)}
                </Angka>
                <Angka bold color={total.profit < 0 ? MERAH : "var(--brand-primary-dark)"}>
                  {formatRupiah(total.profit)}
                </Angka>
                <Angka bold color={warnaMargin(marginTotal)}>
                  {formatMargin(marginTotal)}
                </Angka>
                <Angka bold color={warnaMinus(total.dibayar)}>
                  {formatRupiah(total.dibayar)}
                </Angka>
                <Angka bold color={warnaMinus(total.omset - total.dibayar)}>
                  {formatRupiah(total.omset - total.dibayar)}
                </Angka>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/**
 * Grafik batang omset vs total biaya per bulan. Hover/fokus satu bulan
 * menampilkan rinciannya; angka lengkap tetap ada di tabel.
 */
function GrafikBulanan({ rows }: { rows: LabaBulanRow[] }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const tinggi = 200;
  const maks = Math.max(1, ...rows.map((r) => Math.max(r.omset, totalBiaya(r))));
  const garis = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maks);
  const pilih = aktif === null ? null : rows[aktif];

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, marginBottom: 12 }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          Omset vs biaya per bulan
        </p>
        <div className="flex items-center" style={{ gap: 14, fontSize: 12, color: "var(--text-secondary)" }}>
          <Legenda warna={WARNA_OMSET} label="Omset" />
          <Legenda warna={WARNA_BIAYA} label="Biaya (uang jalan + biaya lainnya)" />
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", gap: 8 }}>
        {/* Sumbu Y */}
        <div
          style={{ position: "relative", width: 44, height: tinggi, fontSize: 10.5, color: "var(--text-tertiary)" }}
          aria-hidden
        >
          {garis.map((g) => (
            <span
              key={g}
              className="mono"
              style={{ position: "absolute", right: 0, bottom: (g / maks) * tinggi - 6, whiteSpace: "nowrap" }}
            >
              {formatRingkas(g)}
            </span>
          ))}
        </div>

        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          {garis.map((g) => (
            <div
              key={g}
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: (g / maks) * tinggi + 18,
                borderTop: g === 0 ? "1px solid var(--border-default)" : "1px dashed var(--border-default)",
                opacity: g === 0 ? 1 : 0.6
              }}
            />
          ))}

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
            {rows.map((r, i) => (
              <button
                key={r.bulan}
                type="button"
                onMouseEnter={() => setAktif(i)}
                onMouseLeave={() => setAktif(null)}
                onFocus={() => setAktif(i)}
                onBlur={() => setAktif(null)}
                aria-label={`${NAMA_BULAN_PANJANG[r.bulan - 1]}: omset ${formatRupiah(r.omset)}, biaya ${formatRupiah(totalBiaya(r))}, profit ${formatRupiah(r.profit)}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: aktif === i ? "rgba(0,0,0,0.035)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  padding: 0,
                  cursor: "default"
                }}
              >
                <div style={{ height: tinggi, display: "flex", alignItems: "flex-end", gap: 2 }}>
                  <Batang nilai={r.omset} maks={maks} tinggi={tinggi} warna={WARNA_OMSET} />
                  <Batang nilai={totalBiaya(r)} maks={maks} tinggi={tinggi} warna={WARNA_BIAYA} />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", height: 18, lineHeight: "18px" }}>
                  {NAMA_BULAN[r.bulan - 1]}
                </span>
              </button>
            ))}
          </div>

          {pilih && aktif !== null && (
            <div
              role="status"
              style={{
                position: "absolute",
                top: 0,
                left: `${((aktif + 0.5) / 12) * 100}%`,
                transform: `translateX(${aktif < 2 ? "-10%" : aktif > 9 ? "-90%" : "-50%"})`,
                background: "white",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                padding: "8px 10px",
                fontSize: 12,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 2
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{NAMA_BULAN_PANJANG[pilih.bulan - 1]}</div>
              <BarisTooltip warna={WARNA_OMSET} label="Omset" nilai={pilih.omset} />
              <BarisTooltip warna={WARNA_BIAYA} label="Biaya" nilai={totalBiaya(pilih)} />
              <div
                className="flex justify-between"
                style={{ gap: 16, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--border-default)" }}
              >
                <span>Profit</span>
                <span className="mono" style={{ fontWeight: 700, color: pilih.profit < 0 ? MERAH : undefined }}>
                  {formatRupiah(pilih.profit)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tagihan aktif (tanpa batal — sama dengan dasar omset) yang terbit di bulan & tahun itu. */
const tautanTagihan = (tahun: number, bulan: number) =>
  `/invoices?tab=tagihan&status=aktif&bulan=${bulan}&tahun=${tahun}`;

/** Angka di tabel yang membuka halaman rinciannya di tab baru (laporan tetap terbuka). */
function TautanAngka({ to, color, children }: { to: string; color?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: color ?? "inherit", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
    >
      {children}
    </Link>
  );
}

/** Keterangan kecil porsi proyek kosongan di dalam angka total. */
function RincianKosongan({ nilai }: { nilai: number }) {
  if (nilai <= 0) return null;
  return (
    <div className="caption" style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-tertiary)" }}>
      termasuk kosongan {formatRupiah(nilai)}
    </div>
  );
}

function Batang({ nilai, maks, tinggi, warna }: { nilai: number; maks: number; tinggi: number; warna: string }) {
  const h = nilai > 0 ? Math.max(2, (nilai / maks) * tinggi) : 0;
  return <div style={{ width: 10, height: h, background: warna, borderRadius: "4px 4px 0 0" }} />;
}

function Legenda({ warna, label }: { warna: string; label: string }) {
  return (
    <span className="flex items-center" style={{ gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: warna }} />
      {label}
    </span>
  );
}

function BarisTooltip({ warna, label, nilai }: { warna: string; label: string; nilai: number }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 16 }}>
      <Legenda warna={warna} label={label} />
      <span className="mono">{formatRupiah(nilai)}</span>
    </div>
  );
}

/** Proyek selesai yang belum ditagih: biayanya sudah keluar, omsetnya belum masuk laporan. */
function BelumDitagih({ data }: { data: LabaTahunan["belum_ditagih"] }) {
  // Daftar tertutup dulu supaya grafik & tabel bulanan tidak terdorong jauh ke bawah.
  const [buka, setBuka] = useState(false);
  const barisDetail = useBarisDetail();
  if (data.jumlah === 0) return null;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div
        className="flex flex-wrap items-center justify-between"
        style={{
          gap: 8,
          border: "1px solid #F3D9A9",
          background: "#FDF6E7",
          borderRadius: buka ? "8px 8px 0 0" : 8,
          padding: "10px 12px",
          fontSize: 13,
          color: "#7A5B12"
        }}
      >
        <span style={{ flex: "1 1 320px" }}>
          <strong>{data.jumlah} proyek sudah selesai tapi belum ditagih</strong> — uang jalan{" "}
          {formatRupiah(data.uang_jalan)} dan biaya lainnya {formatRupiah(data.biaya_lainnya)} sudah keluar, tapi
          belum masuk laporan ini. Angkanya akan masuk ke bulan tagihannya setelah proyek ditagihkan.
        </span>
        <button
          type="button"
          className="btn-link"
          onClick={() => setBuka((b) => !b)}
          aria-expanded={buka}
          style={{ color: "#7A5B12", fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}
        >
          {buka ? "Tutup daftar" : "Lihat daftar proyek"}
        </button>
      </div>
      {buka && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <KepalaKolomLihat />
                <th style={{ width: 170 }}>Proyek</th>
                <th>Customer</th>
                <th style={{ width: 100 }}>Unit</th>
                <th style={{ width: 110 }}>Berangkat</th>
                <th style={{ width: 140, textAlign: "right" }}>Uang jalan</th>
                <th style={{ width: 140, textAlign: "right" }}>Biaya lainnya</th>
              </tr>
            </thead>
            <tbody>
              {data.daftar.map((p) => (
                <tr key={p.proyek_id} {...barisDetail(`/proyek/${p.proyek_id}`)}>
                  <td style={{ width: 44 }}>
                    <TombolLihat tujuan={`/proyek/${p.proyek_id}`} />
                  </td>
                  <td>
                    <span className="mono" style={{ color: "var(--text-primary)", fontSize: 12.5, fontWeight: 600 }}>
                      {p.nomor_proyek}
                    </span>
                    <div className="caption" style={{ fontSize: 10.5 }}>
                      {p.jumlah_job} job
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{p.customer_nama}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {p.unit_kode}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {formatDate(p.etd_awal)}
                  </td>
                  <Angka>{formatRupiah(p.uang_jalan)}</Angka>
                  <Angka>{p.biaya_lainnya > 0 ? formatRupiah(p.biaya_lainnya) : "—"}</Angka>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Angka({ children, bold, color }: { children: ReactNode; bold?: boolean; color?: string }) {
  return (
    <td className="mono" style={{ textAlign: "right", fontSize: 12.5, fontWeight: bold ? 700 : undefined, color }}>
      {children}
    </td>
  );
}

function StatCard({
  label,
  value,
  color,
  keterangan
}: {
  label: string;
  value: string;
  color?: string;
  keterangan?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: color ?? "var(--text-primary)" }}>
        {value}
      </div>
      {keterangan && (
        <div className="caption" style={{ marginTop: 2 }}>
          {keterangan}
        </div>
      )}
    </div>
  );
}
