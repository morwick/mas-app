import { Link, useSearchParams } from "react-router-dom";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/input";
import { PageError } from "@/components/ui/page-state";
import { formatRupiah, hariIniWIB } from "@/lib/utils";
import { useBiayaPerawatan, useKlaimAsuransi } from "../api";

/** Laporan biaya perawatan per aset + rekap klaim per asuransi (periode tanggal WO). */
export function LaporanPerawatan() {
  const [sp, setSp] = useSearchParams();
  const hariIni = hariIniWIB();
  const start = sp.get("start") || `${hariIni.slice(0, 8)}01`;
  const end = sp.get("end") || hariIni;
  const biaya = useBiayaPerawatan(start, end);
  const klaim = useKlaimAsuransi(start, end);
  const ubah = (k: "start" | "end") => (v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
  };

  const rows = biaya.data ?? [];
  const total = rows.reduce(
    (s, r) => ({
      wo: s.wo + r.jumlah_wo,
      biaya: s.biaya + r.total_biaya,
      asuransi: s.asuransi + r.ditanggung_asuransi,
      perusahaan: s.perusahaan + r.ditanggung_perusahaan,
      hari: s.hari + r.hari_perbaikan
    }),
    { wo: 0, biaya: 0, asuransi: 0, perusahaan: 0, hari: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Biaya perawatan & klaim asuransi</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Dari perintah kerja perbaikan (tidak termasuk yang dibatalkan) berdasarkan tanggal perintah kerja.
        </p>
      </div>
      <div className="card card-pad flex flex-wrap gap-3 items-end">
        <Field label="Dari tanggal">
          <DateInput value={start} onChange={ubah("start")} max={end} />
        </Field>
        <Field label="Sampai tanggal">
          <DateInput value={end} onChange={ubah("end")} min={start} />
        </Field>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Perintah kerja", nilai: String(total.wo) },
          { label: "Total biaya", nilai: formatRupiah(total.biaya) },
          { label: "Ditanggung asuransi", nilai: formatRupiah(total.asuransi) },
          { label: "Ditanggung perusahaan", nilai: formatRupiah(total.perusahaan) }
        ].map((k) => (
          <div key={k.label} className="card card-pad">
            <div className="caption">{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{k.nilai}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-pad h3">Biaya perawatan per aset</div>
        {biaya.isError ? (
          <PageError error={biaya.error} onRetry={biaya.refetch} />
        ) : biaya.isPending ? (
          <p className="caption card-pad">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="caption card-pad">Tidak ada perintah kerja pada periode ini.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Aset</th>
                  <th style={{ textAlign: "right" }}>WO</th>
                  <th style={{ textAlign: "right" }}>Jasa</th>
                  <th style={{ textAlign: "right" }}>Sparepart</th>
                  <th style={{ textAlign: "right" }}>Lain-lain</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>Asuransi</th>
                  <th style={{ textAlign: "right" }}>Perusahaan</th>
                  <th style={{ textAlign: "right" }}>Hari perbaikan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.jenis_aset}:${r.aset_id}`}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={r.jenis_aset === "unit" ? `/units/${r.aset_id}?tab=perbaikan` : `/unit-trailer/${r.aset_id}?tab=perbaikan`}>
                        {r.kode_aset}
                      </Link>
                      <div className="caption">{r.jenis_aset === "unit" ? "Unit" : "Unit trailer"}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>{r.jumlah_wo}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(r.total_jasa)}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(r.total_sparepart)}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(r.total_lain)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatRupiah(r.total_biaya)}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(r.ditanggung_asuransi)}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(r.ditanggung_perusahaan)}</td>
                    <td style={{ textAlign: "right" }}>{r.hari_perbaikan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card-pad h3">Rekap klaim per asuransi</div>
        {klaim.isError ? (
          <PageError error={klaim.error} onRetry={klaim.refetch} />
        ) : (klaim.data ?? []).length === 0 ? (
          <p className="caption card-pad">{klaim.isPending ? "Memuat…" : "Tidak ada klaim asuransi pada periode ini."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Asuransi</th>
                  <th style={{ textAlign: "right" }}>Klaim</th>
                  <th style={{ textAlign: "right" }}>Proses</th>
                  <th style={{ textAlign: "right" }}>Disetujui</th>
                  <th style={{ textAlign: "right" }}>Dibayar</th>
                  <th style={{ textAlign: "right" }}>Ditolak</th>
                  <th style={{ textAlign: "right" }}>Nilai diajukan</th>
                  <th style={{ textAlign: "right" }}>Nilai disetujui</th>
                </tr>
              </thead>
              <tbody>
                {(klaim.data ?? []).map((k) => (
                  <tr key={k.asuransi_id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/asuransi/${k.asuransi_id}`}>{k.asuransi_nama}</Link>
                    </td>
                    <td style={{ textAlign: "right" }}>{k.jumlah_klaim}</td>
                    <td style={{ textAlign: "right" }}>{k.diajukan}</td>
                    <td style={{ textAlign: "right" }}>{k.disetujui}</td>
                    <td style={{ textAlign: "right" }}>{k.dibayar}</td>
                    <td style={{ textAlign: "right" }}>{k.ditolak}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(k.nilai_diajukan)}</td>
                    <td style={{ textAlign: "right" }}>{formatRupiah(k.nilai_disetujui)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
