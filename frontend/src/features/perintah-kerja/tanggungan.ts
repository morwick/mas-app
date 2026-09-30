import type { Pelaksana, StatusKlaim, Tanggungan } from "./api";

const uang = (x: number) => Math.round(Math.max(x, 0) * 100) / 100;

/**
 * Siapa menanggung biaya — salinan aturan backend
 * (`app/modules/perintah_kerja/tanggungan.py`) untuk pratinjau di form:
 *  - bukan asuransi / belum ada klaim / klaim ditolak → seluruhnya perusahaan;
 *  - disetujui / dibayar → asuransi = min(disetujui, total) − own risk;
 *  - diajukan / survei → sama, memakai nilai diajukan (estimasi).
 */
export function hitungTanggungan(
  total: number,
  pelaksana: Pelaksana,
  klaim: {
    status_klaim: StatusKlaim;
    nilai_diajukan: number | null;
    nilai_disetujui: number | null;
    own_risk: number | null;
  } | null
): Tanggungan {
  const t = uang(total);
  if (pelaksana !== "asuransi" || !klaim || klaim.status_klaim === "ditolak") {
    return { total: t, asuransi: 0, perusahaan: t, own_risk: klaim ? uang(klaim.own_risk ?? 0) : 0, estimasi: false };
  }
  const ownRisk = uang(klaim.own_risk ?? 0);
  const disetujui = klaim.status_klaim === "disetujui" || klaim.status_klaim === "dibayar";
  const dasar = disetujui ? (klaim.nilai_disetujui ?? 0) : (klaim.nilai_diajukan ?? t);
  const asuransi = uang(Math.min(dasar, t) - ownRisk);
  return { total: t, asuransi, perusahaan: uang(t - asuransi), own_risk: ownRisk, estimasi: !disetujui };
}
