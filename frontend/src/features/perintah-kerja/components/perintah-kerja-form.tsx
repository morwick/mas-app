import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, HardHat, Plus, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateInput } from "@/components/ui/date-input";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { ALL_PAGE_SIZE } from "@/components/ui/pagination";
import { formatRupiah, hariIniWIB } from "@/lib/utils";
import { useUnitIncidents, useUnits } from "@/features/units/queries";
import { useUnitTrailer, useUnitTrailerIncidents } from "@/features/unit-trailer/queries";
import { useAsuransi, usePolisBerlaku } from "@/features/asuransi/queries";
import { useBengkelList } from "@/features/bengkel/api";
import { useMekanikList } from "@/features/mekanik/api";
import {
  JENIS_WO,
  PELAKSANA,
  PRIORITAS,
  STATUS_KLAIM,
  SUMBER_WO,
  createPerintahKerja,
  updatePerintahKerja,
  type JenisAset,
  type JenisWo,
  type Pelaksana,
  type PerintahKerja,
  type PerintahKerjaInput,
  type Prioritas,
  type StatusKlaim,
  type SumberWo
} from "../api";
import { hitungTanggungan } from "../tanggungan";

interface Awal {
  jenisAset?: JenisAset;
  asetId?: string;
  incidentId?: string;
}

interface Props {
  mode: "new" | "edit";
  initial?: PerintahKerja;
  /** Isian awal dari tautan (mis. tombol "Buat perintah kerja" di insiden). */
  awal?: Awal;
}

type Baris<T> = T & { kunci: string };
interface JasaBaris {
  id: string | null;
  uraian: string;
  mekanik_id: string;
  jam: string;
  biaya: string;
}
interface PartBaris {
  id: string | null;
  kode: string;
  nama: string;
  qty: string;
  satuan: string;
  harga: string;
  keterangan: string;
}
interface LainBaris {
  id: string | null;
  uraian: string;
  biaya: string;
}

let urut = 0;
const kunci = () => `b${++urut}`;
const digit = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n)));
const angka = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));
const angkaAtauNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function PerintahKerjaForm({ mode, initial, awal }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const [jenisAset, setJenisAset] = useState<JenisAset>(initial?.jenis_aset ?? awal?.jenisAset ?? "unit");
  const [asetId, setAsetId] = useState(initial?.aset_id ?? awal?.asetId ?? "");
  const [tanggal, setTanggal] = useState(initial?.tanggal ?? hariIniWIB());
  const [sumber, setSumber] = useState<SumberWo>(initial?.sumber ?? (awal?.incidentId ? "insiden" : "lainnya"));
  const [incidentId, setIncidentId] = useState(initial?.incident_id ?? awal?.incidentId ?? "");
  const [jenis, setJenis] = useState<JenisWo>(initial?.jenis ?? "lainnya");
  const [prioritas, setPrioritas] = useState<Prioritas>(initial?.prioritas ?? "normal");
  const [keluhan, setKeluhan] = useState(initial?.keluhan ?? "");
  const [diagnosa, setDiagnosa] = useState(initial?.diagnosa ?? "");
  const [catatan, setCatatan] = useState(initial?.catatan ?? "");
  const [odometer, setOdometer] = useState(initial?.odometer_km != null ? String(initial.odometer_km) : "");
  const [jadwalMulai, setJadwalMulai] = useState(initial?.jadwal_mulai ?? "");
  const [estimasiSelesai, setEstimasiSelesai] = useState(initial?.estimasi_selesai ?? "");
  const [statusAwal, setStatusAwal] = useState<"draft" | "dijadwalkan" | "dikerjakan">("draft");

  const [pelaksana, setPelaksana] = useState<Pelaksana>(initial?.pelaksana ?? "internal");
  const [mekanik, setMekanik] = useState<{ mekanik_id: string; pj: boolean }[]>(
    initial?.mekanik.map((m) => ({ mekanik_id: m.mekanik_id, pj: m.is_penanggung_jawab })) ?? []
  );
  const [bengkelId, setBengkelId] = useState(initial?.bengkel_id ?? "");
  const [noNota, setNoNota] = useState(initial?.no_nota ?? "");
  const [rekananId, setRekananId] = useState(initial?.bengkel_rekanan_id ?? "");
  const [klaim, setKlaim] = useState({
    pic_id: initial?.klaim?.pic?.id ?? "",
    nomor_klaim: initial?.klaim?.nomor_klaim ?? "",
    tanggal_pengajuan: initial?.klaim?.tanggal_pengajuan ?? "",
    status_klaim: (initial?.klaim?.status_klaim ?? "diajukan") as StatusKlaim,
    nilai_diajukan: digit(initial?.klaim?.nilai_diajukan),
    nilai_disetujui: digit(initial?.klaim?.nilai_disetujui),
    own_risk: digit(initial?.klaim?.own_risk),
    catatan: initial?.klaim?.catatan ?? ""
  });

  const [jasa, setJasa] = useState<Baris<JasaBaris>[]>(
    initial?.jasa.map((j) => ({
      kunci: kunci(),
      id: j.id,
      uraian: j.uraian,
      mekanik_id: j.mekanik_id ?? "",
      jam: j.jam_kerja != null ? String(j.jam_kerja) : "",
      biaya: digit(j.biaya)
    })) ?? []
  );
  const [part, setPart] = useState<Baris<PartBaris>[]>(
    initial?.sparepart.map((p) => ({
      kunci: kunci(),
      id: p.id,
      kode: p.kode ?? "",
      nama: p.nama,
      qty: String(p.qty),
      satuan: p.satuan ?? "",
      harga: digit(p.harga_satuan),
      keterangan: p.keterangan ?? ""
    })) ?? []
  );
  const [lain, setLain] = useState<Baris<LainBaris>[]>(
    initial?.biaya_lain.map((b) => ({ kunci: kunci(), id: b.id, uraian: b.uraian, biaya: digit(b.biaya) })) ?? []
  );

  // ── Data pilihan ──────────────────────────────────────────────────────────
  const units = useUnits(false);
  const trailers = useUnitTrailer({ page: 1, pageSize: ALL_PAGE_SIZE, q: "", status: "", jenisUnitTrailerId: "" });
  const insidenUnit = useUnitIncidents(jenisAset === "unit" && asetId ? asetId : undefined);
  const insidenTrailer = useUnitTrailerIncidents(jenisAset === "unit_trailer" ? asetId : "");
  const mekanikList = useMekanikList(false);
  const bengkelList = useBengkelList(false);
  const aset = asetId ? (jenisAset === "unit" ? { unit_id: asetId } : { unit_trailer_id: asetId }) : null;
  const polis = usePolisBerlaku(aset, tanggal);
  const polisBerlaku = polis.data ?? null;
  const asuransi = useAsuransi(polisBerlaku?.asuransi_id);

  const asetOptions =
    jenisAset === "unit"
      ? (units.data ?? [])
          .filter((u) => !["terjual", "diafkirkan"].includes(u.status) || u.id === initial?.aset_id)
          .map((u) => ({ value: u.id, label: u.kode_unit, hint: `${u.jenis_unit_nama} · ${u.no_polisi}` }))
      : (trailers.data?.items ?? [])
          .filter((t) => !["terjual", "diafkirkan"].includes(t.status) || t.id === initial?.aset_id)
          .map((t) => ({ value: t.id, label: t.kode_trailer, hint: t.jenis_nama ?? undefined }));
  const insiden = (jenisAset === "unit" ? insidenUnit.data : insidenTrailer.data) ?? [];
  const insidenOptions = insiden
    .filter((i) => i.status !== "resolved" || i.id === initial?.incident_id)
    .map((i) => ({ value: i.id, label: i.deskripsi, hint: `${i.tipe} · ${i.tanggal.slice(0, 10)}` }));
  const mekanikNama = new Map((mekanikList.data ?? []).map((m) => [m.id, m.nama]));
  initial?.mekanik.forEach((m) => mekanikNama.set(m.mekanik_id, m.nama));

  // Polis hilang (tanggal / aset diganti) → pelaksana asuransi tidak berlaku lagi.
  useEffect(() => {
    if (pelaksana === "asuransi" && polis.isSuccess && !polisBerlaku) setPelaksana("internal");
  }, [pelaksana, polis.isSuccess, polisBerlaku]);
  // Own risk klaim mengikuti polis bila belum diisi.
  useEffect(() => {
    if (polisBerlaku?.own_risk != null && klaim.own_risk === "")
      setKlaim((k) => ({ ...k, own_risk: digit(polisBerlaku.own_risk) }));
  }, [polisBerlaku, klaim.own_risk]);

  // ── Total & tanggungan ────────────────────────────────────────────────────
  const totalJasa = jasa.reduce((s, j) => s + angka(j.biaya), 0);
  const totalPart = part.reduce((s, p) => s + angka(p.qty) * angka(p.harga), 0);
  const totalLain = lain.reduce((s, b) => s + angka(b.biaya), 0);
  const total = totalJasa + totalPart + totalLain;
  const tanggungan = useMemo(
    () =>
      hitungTanggungan(
        total,
        pelaksana,
        pelaksana === "asuransi"
          ? {
              status_klaim: klaim.status_klaim,
              nilai_diajukan: angkaAtauNull(klaim.nilai_diajukan),
              nilai_disetujui: angkaAtauNull(klaim.nilai_disetujui),
              own_risk: angkaAtauNull(klaim.own_risk)
            }
          : null
      ),
    [total, pelaksana, klaim]
  );

  function validasi(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!asetId) e.aset = `Pilih ${jenisAset === "unit" ? "unit" : "unit trailer"}`;
    if (!tanggal) e.tanggal = "Tanggal wajib diisi";
    if (pelaksana === "internal" && mekanik.length === 0) e.pelaksana = "Pilih minimal satu mekanik";
    if (pelaksana === "bengkel" && !bengkelId) e.pelaksana = "Pilih bengkel";
    if (pelaksana === "asuransi" && !polisBerlaku) e.pelaksana = "Aset belum punya polis yang berlaku pada tanggal ini";
    if (
      pelaksana === "asuransi" &&
      ["disetujui", "dibayar"].includes(klaim.status_klaim) &&
      klaim.nilai_disetujui === ""
    )
      e.klaim = "Nilai disetujui wajib diisi bila klaim disetujui / dibayar";
    if (estimasiSelesai && jadwalMulai && estimasiSelesai < jadwalMulai)
      e.jadwal = "Estimasi selesai tidak boleh sebelum jadwal mulai";
    if (jasa.some((j) => !j.uraian.trim())) e.rincian = "Uraian jasa wajib diisi";
    else if (part.some((p) => !p.nama.trim() || !(angka(p.qty) > 0)))
      e.rincian = "Nama sparepart wajib diisi dan jumlahnya lebih dari 0";
    else if (lain.some((b) => !b.uraian.trim())) e.rincian = "Uraian biaya lain wajib diisi";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validasi();
    setErr(e);
    const pesan = Object.values(e)[0];
    if (pesan) {
      toast.error(`${mode === "new" ? "Gagal menambah data" : "Gagal mengubah data"}. ${pesan}`);
      return;
    }
    const pj = mekanik.some((m) => m.pj) ? mekanik : mekanik.map((m, i) => ({ ...m, pj: i === 0 }));
    const input: PerintahKerjaInput = {
      unit_id: jenisAset === "unit" ? asetId : null,
      unit_trailer_id: jenisAset === "unit_trailer" ? asetId : null,
      tanggal,
      incident_id: sumber === "insiden" ? incidentId || null : null,
      sumber,
      jenis,
      prioritas,
      keluhan: keluhan.trim() || null,
      diagnosa: diagnosa.trim() || null,
      catatan: catatan.trim() || null,
      pelaksana,
      bengkel_id: pelaksana === "bengkel" ? bengkelId : null,
      polis_id: pelaksana === "asuransi" ? (polisBerlaku?.id ?? null) : null,
      bengkel_rekanan_id: pelaksana === "asuransi" ? rekananId || null : null,
      no_nota: noNota.trim() || null,
      jadwal_mulai: jadwalMulai || null,
      estimasi_selesai: estimasiSelesai || null,
      odometer_km: jenisAset === "unit" ? angkaAtauNull(odometer) : null,
      status_wo: statusAwal,
      mekanik: pelaksana === "internal" ? pj.map((m) => ({ mekanik_id: m.mekanik_id, is_penanggung_jawab: m.pj })) : [],
      jasa: jasa.map((j) => ({
        id: j.id,
        uraian: j.uraian.trim(),
        mekanik_id: j.mekanik_id || null,
        jam_kerja: angkaAtauNull(j.jam),
        biaya: angka(j.biaya)
      })),
      sparepart: part.map((p) => ({
        id: p.id,
        kode: p.kode.trim() || null,
        nama: p.nama.trim(),
        qty: angka(p.qty),
        satuan: p.satuan.trim() || null,
        harga_satuan: angka(p.harga),
        keterangan: p.keterangan.trim() || null
      })),
      biaya_lain: lain.map((b) => ({ id: b.id, uraian: b.uraian.trim(), biaya: angka(b.biaya) })),
      klaim:
        pelaksana === "asuransi"
          ? {
              pic_id: klaim.pic_id || null,
              nomor_klaim: klaim.nomor_klaim.trim() || null,
              tanggal_pengajuan: klaim.tanggal_pengajuan || null,
              status_klaim: klaim.status_klaim,
              nilai_diajukan: angkaAtauNull(klaim.nilai_diajukan),
              nilai_disetujui: angkaAtauNull(klaim.nilai_disetujui),
              own_risk: angkaAtauNull(klaim.own_risk),
              catatan: klaim.catatan.trim() || null
            }
          : null
    };
    setLoading(true);
    const res = mode === "new" ? await createPerintahKerja(input) : await updatePerintahKerja(initial!.id, input);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const id = mode === "new" ? (res.data as PerintahKerja).id : initial!.id;
    toast.success(mode === "new" ? `Perintah kerja ${(res.data as PerintahKerja).nomor} dibuat` : "Perubahan disimpan");
    navigate(`/perintah-kerja/${id}`);
  }

  const mekanikBelumDipilih = (mekanikList.data ?? []).filter((m) => !mekanik.some((x) => x.mekanik_id === m.id));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[960px]">
      <Card>
        <CardHeader
          title={mode === "new" ? "Buat perintah kerja" : `Edit perintah kerja ${initial?.nomor ?? ""}`}
          description="Aset yang diperbaiki dan pekerjaannya"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis aset" required>
            <Select
              value={jenisAset}
              onChange={(e) => {
                setJenisAset(e.target.value as JenisAset);
                setAsetId("");
                setIncidentId("");
              }}
              disabled={mode === "edit"}
            >
              <option value="unit">Unit</option>
              <option value="unit_trailer">Unit trailer</option>
            </Select>
          </Field>
          <Field label={jenisAset === "unit" ? "Unit" : "Unit trailer"} required>
            <Combobox
              value={asetId}
              onChange={(v) => {
                setAsetId(v);
                setIncidentId("");
                setErr((e) => ({ ...e, aset: "" }));
              }}
              options={asetOptions}
              placeholder="Pilih aset"
              searchPlaceholder="Ketik kode aset…"
              emptyText="Aset tidak ditemukan"
              disabled={mode === "edit"}
              error={err.aset || undefined}
            />
          </Field>
          <Field label="Tanggal" required hint="Tanggal kejadian / permintaan perbaikan">
            <DateInput value={tanggal} onChange={setTanggal} error={err.tanggal} />
          </Field>
          <Field label="Sumber">
            <Select value={sumber} onChange={(e) => setSumber(e.target.value as SumberWo)}>
              {SUMBER_WO.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {sumber === "insiden" && (
            <Field
              label="Insiden"
              className="sm:col-span-2"
              hint="Insiden ikut diproses: jadi Dalam penanganan saat WO dikerjakan, dan Selesai saat WO selesai."
            >
              <Combobox
                value={incidentId}
                onChange={setIncidentId}
                options={insidenOptions}
                placeholder={asetId ? "Pilih insiden yang belum selesai" : "Pilih aset dulu"}
                searchPlaceholder="Cari insiden…"
                emptyText="Tidak ada insiden terbuka untuk aset ini"
                disabled={!asetId}
                clearable
              />
            </Field>
          )}
          <Field label="Jenis pekerjaan">
            <Select value={jenis} onChange={(e) => setJenis(e.target.value as JenisWo)}>
              {JENIS_WO.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioritas">
            <Select value={prioritas} onChange={(e) => setPrioritas(e.target.value as Prioritas)}>
              {PRIORITAS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Keluhan / kerusakan" className="sm:col-span-2">
            <Textarea value={keluhan} onChange={(e) => setKeluhan(e.target.value)} placeholder="Apa yang dilaporkan" />
          </Field>
          <Field label="Diagnosa" className="sm:col-span-2">
            <Textarea
              value={diagnosa}
              onChange={(e) => setDiagnosa(e.target.value)}
              placeholder="Hasil pemeriksaan mekanik / bengkel (opsional)"
            />
          </Field>
          <Field label="Jadwal mulai">
            <DateInput value={jadwalMulai} onChange={setJadwalMulai} clearable />
          </Field>
          <Field label="Estimasi selesai">
            <DateInput
              value={estimasiSelesai}
              onChange={setEstimasiSelesai}
              min={jadwalMulai || undefined}
              clearable
              error={err.jadwal}
            />
          </Field>
          {jenisAset === "unit" && (
            <Field label="Odometer saat servis (km)" hint="Dipakai menghitung jadwal servis berikutnya">
              <Input inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
            </Field>
          )}
          {mode === "new" && (
            <Field label="Status awal" hint="Dikerjakan → status aset langsung menjadi Perbaikan">
              <Select
                value={statusAwal}
                onChange={(e) => setStatusAwal(e.target.value as "draft" | "dijadwalkan" | "dikerjakan")}
              >
                <option value="draft">Draft</option>
                <option value="dijadwalkan">Dijadwalkan</option>
                <option value="dikerjakan">Langsung dikerjakan</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Pelaksana" description="Siapa yang mengerjakan perbaikan" />
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
          {PELAKSANA.map((p) => {
            const nonaktif = p.value === "asuransi" && !polisBerlaku;
            const dipilih = pelaksana === p.value;
            const Ikon = p.value === "internal" ? HardHat : p.value === "bengkel" ? Building2 : ShieldCheck;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={dipilih}
                disabled={nonaktif}
                onClick={() => {
                  setPelaksana(p.value);
                  setErr((e) => ({ ...e, pelaksana: "" }));
                }}
                className="card card-pad"
                style={{
                  textAlign: "left",
                  cursor: nonaktif ? "not-allowed" : "pointer",
                  opacity: nonaktif ? 0.55 : 1,
                  borderColor: dipilih ? "var(--brand-primary)" : undefined,
                  borderWidth: dipilih ? 1.5 : undefined,
                  background: dipilih ? "var(--brand-primary-light)" : undefined
                }}
              >
                <div className="flex items-center gap-2" style={{ fontWeight: 600 }}>
                  <Ikon style={{ width: 16, height: 16 }} />
                  {p.label}
                </div>
                <div className="caption" style={{ marginTop: 4 }}>
                  {nonaktif
                    ? asetId
                      ? "Aset belum punya polis yang berlaku pada tanggal ini"
                      : "Pilih aset dulu"
                    : p.hint}
                </div>
              </button>
            );
          })}
        </div>
        {err.pelaksana && <p className="field-error" style={{ marginTop: 8 }}>{err.pelaksana}</p>}

        {pelaksana === "internal" && (
          <div className="flex flex-col gap-3" style={{ marginTop: 16 }}>
            <div className="flex flex-wrap gap-2">
              {mekanik.map((m) => (
                <span
                  key={m.mekanik_id}
                  className="badge"
                  style={{ height: 30, padding: "0 6px 0 10px", gap: 6, fontSize: 12.5 }}
                >
                  {mekanikNama.get(m.mekanik_id) ?? "Mekanik"}
                  <button
                    type="button"
                    title={m.pj ? "Penanggung jawab" : "Jadikan penanggung jawab"}
                    onClick={() => setMekanik((l) => l.map((x) => ({ ...x, pj: x.mekanik_id === m.mekanik_id })))}
                    style={{ border: "none", background: "none", cursor: "pointer", display: "inline-flex" }}
                  >
                    <Star
                      style={{ width: 14, height: 14 }}
                      fill={m.pj ? "#E48F00" : "none"}
                      color={m.pj ? "#E48F00" : "currentColor"}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Lepas mekanik"
                    onClick={() => setMekanik((l) => l.filter((x) => x.mekanik_id !== m.mekanik_id))}
                    style={{ border: "none", background: "none", cursor: "pointer", display: "inline-flex" }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </span>
              ))}
            </div>
            <Field
              label="Tambah mekanik"
              hint="Klik bintang untuk menandai penanggung jawab. Belum ada? Tambahkan di menu Master → Mekanik."
            >
              <Combobox
                value=""
                onChange={(v) => {
                  if (!v) return;
                  setMekanik((l) => [...l, { mekanik_id: v, pj: l.length === 0 }]);
                  setErr((e) => ({ ...e, pelaksana: "" }));
                }}
                options={mekanikBelumDipilih.map((m) => ({ value: m.id, label: m.nama, hint: m.keahlian ?? undefined }))}
                placeholder={mekanikList.isLoading ? "Memuat mekanik…" : "Pilih mekanik"}
                searchPlaceholder="Ketik nama mekanik…"
                emptyText="Mekanik tidak ditemukan"
              />
            </Field>
          </div>
        )}

        {pelaksana === "bengkel" && (
          <div className="grid gap-4 sm:grid-cols-2" style={{ marginTop: 16 }}>
            <Field label="Bengkel" required hint="Belum ada? Tambahkan di menu Master → Bengkel.">
              <Combobox
                value={bengkelId}
                onChange={(v) => {
                  setBengkelId(v);
                  setErr((e) => ({ ...e, pelaksana: "" }));
                }}
                options={(bengkelList.data ?? []).map((b) => ({
                  value: b.id,
                  label: b.nama,
                  hint: b.spesialisasi ?? undefined
                }))}
                placeholder="Pilih bengkel"
                searchPlaceholder="Ketik nama bengkel…"
                emptyText="Bengkel tidak ditemukan"
              />
            </Field>
            <Field label="No. nota / penawaran bengkel">
              <Input value={noNota} onChange={(e) => setNoNota(e.target.value)} />
            </Field>
          </div>
        )}

        {pelaksana === "asuransi" && polisBerlaku && (
          <div className="flex flex-col gap-4" style={{ marginTop: 16 }}>
            <div className="caption" style={{ background: "var(--bg-subtle)", padding: 10, borderRadius: 8 }}>
              Polis <strong className="mono">{polisBerlaku.nomor_polis}</strong> · {polisBerlaku.asuransi_nama} ·
              berlaku s/d {polisBerlaku.berakhir} · own risk{" "}
              {polisBerlaku.own_risk != null ? formatRupiah(polisBerlaku.own_risk) : "—"}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bengkel rekanan">
                <Select value={rekananId} onChange={(e) => setRekananId(e.target.value)}>
                  <option value="">— belum dipilih —</option>
                  {(asuransi.data?.bengkel_rekanan ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="PIC asuransi yang menangani">
                <Select value={klaim.pic_id} onChange={(e) => setKlaim((k) => ({ ...k, pic_id: e.target.value }))}>
                  <option value="">— belum dipilih —</option>
                  {(asuransi.data?.pic ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama} · {p.no_hp}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="No. klaim">
                <Input
                  value={klaim.nomor_klaim}
                  onChange={(e) => setKlaim((k) => ({ ...k, nomor_klaim: e.target.value }))}
                />
              </Field>
              <Field label="Tanggal pengajuan klaim">
                <DateInput
                  value={klaim.tanggal_pengajuan}
                  onChange={(v) => setKlaim((k) => ({ ...k, tanggal_pengajuan: v }))}
                  clearable
                />
              </Field>
              <Field label="Status klaim">
                <Select
                  value={klaim.status_klaim}
                  onChange={(e) => setKlaim((k) => ({ ...k, status_klaim: e.target.value as StatusKlaim }))}
                >
                  {(Object.keys(STATUS_KLAIM) as StatusKlaim[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_KLAIM[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Own risk (Rp)" hint="Terisi dari polis; ubah bila berbeda">
                <CurrencyInput value={klaim.own_risk} onChange={(v) => setKlaim((k) => ({ ...k, own_risk: v }))} />
              </Field>
              <Field label="Nilai klaim diajukan (Rp)">
                <CurrencyInput
                  value={klaim.nilai_diajukan}
                  onChange={(v) => setKlaim((k) => ({ ...k, nilai_diajukan: v }))}
                />
              </Field>
              <Field label="Nilai disetujui asuransi (Rp)">
                <CurrencyInput
                  value={klaim.nilai_disetujui}
                  onChange={(v) => setKlaim((k) => ({ ...k, nilai_disetujui: v }))}
                  error={err.klaim || undefined}
                />
              </Field>
              <Field label="Catatan klaim" className="sm:col-span-2">
                <Textarea value={klaim.catatan} onChange={(e) => setKlaim((k) => ({ ...k, catatan: e.target.value }))} />
              </Field>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Rincian biaya" description="Jasa, sparepart, dan biaya lain" />
        {err.rincian && <p className="field-error" style={{ marginBottom: 8 }}>{err.rincian}</p>}

        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Jasa / pekerjaan
        </div>
        <div className="flex flex-col gap-2">
          {jasa.map((j) => (
            <div key={j.kunci} className="grid gap-2 sm:grid-cols-12 items-end">
              <Field label="Uraian" required className="sm:col-span-5">
                <Input
                  value={j.uraian}
                  onChange={(e) => setJasa((l) => l.map((x) => (x.kunci === j.kunci ? { ...x, uraian: e.target.value } : x)))}
                />
              </Field>
              <Field label="Mekanik" className="sm:col-span-3">
                <Select
                  value={j.mekanik_id}
                  onChange={(e) =>
                    setJasa((l) => l.map((x) => (x.kunci === j.kunci ? { ...x, mekanik_id: e.target.value } : x)))
                  }
                >
                  <option value="">—</option>
                  {mekanik.map((m) => (
                    <option key={m.mekanik_id} value={m.mekanik_id}>
                      {mekanikNama.get(m.mekanik_id)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jam" className="sm:col-span-1">
                <Input
                  inputMode="decimal"
                  value={j.jam}
                  onChange={(e) => setJasa((l) => l.map((x) => (x.kunci === j.kunci ? { ...x, jam: e.target.value } : x)))}
                />
              </Field>
              <Field label="Biaya (Rp)" className="sm:col-span-2">
                <CurrencyInput
                  value={j.biaya}
                  onChange={(v) => setJasa((l) => l.map((x) => (x.kunci === j.kunci ? { ...x, biaya: v } : x)))}
                />
              </Field>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Hapus jasa"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setJasa((l) => l.filter((x) => x.kunci !== j.kunci))}
                />
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                setJasa((l) => [...l, { kunci: kunci(), id: null, uraian: "", mekanik_id: "", jam: "", biaya: "" }])
              }
            >
              Tambah jasa
            </Button>
          </div>
        </div>

        <div className="eyebrow" style={{ margin: "18px 0 6px" }}>
          Sparepart
        </div>
        <div className="flex flex-col gap-2">
          {part.map((p) => (
            <div key={p.kunci} className="grid gap-2 sm:grid-cols-12 items-end">
              <Field label="Kode" className="sm:col-span-2">
                <Input
                  value={p.kode}
                  onChange={(e) => setPart((l) => l.map((x) => (x.kunci === p.kunci ? { ...x, kode: e.target.value } : x)))}
                />
              </Field>
              <Field label="Nama sparepart" required className="sm:col-span-3">
                <Input
                  value={p.nama}
                  onChange={(e) => setPart((l) => l.map((x) => (x.kunci === p.kunci ? { ...x, nama: e.target.value } : x)))}
                />
              </Field>
              <Field label="Qty" required className="sm:col-span-1">
                <Input
                  inputMode="decimal"
                  value={p.qty}
                  onChange={(e) => setPart((l) => l.map((x) => (x.kunci === p.kunci ? { ...x, qty: e.target.value } : x)))}
                />
              </Field>
              <Field label="Satuan" className="sm:col-span-1">
                <Input
                  value={p.satuan}
                  placeholder="pcs"
                  onChange={(e) =>
                    setPart((l) => l.map((x) => (x.kunci === p.kunci ? { ...x, satuan: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Harga satuan (Rp)" className="sm:col-span-2">
                <CurrencyInput
                  value={p.harga}
                  onChange={(v) => setPart((l) => l.map((x) => (x.kunci === p.kunci ? { ...x, harga: v } : x)))}
                />
              </Field>
              <div className="sm:col-span-2 caption" style={{ paddingBottom: 10 }}>
                = {formatRupiah(angka(p.qty) * angka(p.harga))}
              </div>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Hapus sparepart"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setPart((l) => l.filter((x) => x.kunci !== p.kunci))}
                />
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                setPart((l) => [
                  ...l,
                  { kunci: kunci(), id: null, kode: "", nama: "", qty: "1", satuan: "", harga: "", keterangan: "" }
                ])
              }
            >
              Tambah sparepart
            </Button>
          </div>
        </div>

        <div className="eyebrow" style={{ margin: "18px 0 6px" }}>
          Biaya lain
        </div>
        <div className="flex flex-col gap-2">
          {lain.map((b) => (
            <div key={b.kunci} className="grid gap-2 sm:grid-cols-12 items-end">
              <Field label="Uraian" required className="sm:col-span-7">
                <Input
                  value={b.uraian}
                  placeholder="mis. derek, transport"
                  onChange={(e) => setLain((l) => l.map((x) => (x.kunci === b.kunci ? { ...x, uraian: e.target.value } : x)))}
                />
              </Field>
              <Field label="Biaya (Rp)" className="sm:col-span-4">
                <CurrencyInput
                  value={b.biaya}
                  onChange={(v) => setLain((l) => l.map((x) => (x.kunci === b.kunci ? { ...x, biaya: v } : x)))}
                />
              </Field>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Hapus biaya lain"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setLain((l) => l.filter((x) => x.kunci !== b.kunci))}
                />
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setLain((l) => [...l, { kunci: kunci(), id: null, uraian: "", biaya: "" }])}
            >
              Tambah biaya lain
            </Button>
          </div>
        </div>

        <div className="divider" style={{ margin: "18px 0 12px" }} />
        <RingkasanBiaya
          jasa={totalJasa}
          sparepart={totalPart}
          lain={totalLain}
          pelaksana={pelaksana}
          asuransi={tanggungan.asuransi}
          perusahaan={tanggungan.perusahaan}
          estimasi={tanggungan.estimasi}
        />
      </Card>

      <Card>
        <Field label="Catatan">
          <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" />
        </Field>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link to={mode === "edit" && initial ? `/perintah-kerja/${initial.id}` : "/services?tab=perintah-kerja"}>
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading}>
          {mode === "new" ? "Simpan perintah kerja" : "Simpan perubahan"}
        </Button>
      </div>
      <LoadingOverlay message={loading ? "Menyimpan perintah kerja…" : null} />
    </form>
  );
}

export function RingkasanBiaya({
  jasa,
  sparepart,
  lain,
  pelaksana,
  asuransi,
  perusahaan,
  estimasi
}: {
  jasa: number;
  sparepart: number;
  lain: number;
  pelaksana: Pelaksana;
  asuransi: number;
  perusahaan: number;
  estimasi: boolean;
}) {
  const baris = (label: string, nilai: number, tebal = false) => (
    <div className="flex justify-between gap-3" style={{ fontWeight: tebal ? 700 : 400, fontSize: tebal ? 15 : 13 }}>
      <span>{label}</span>
      <span>{formatRupiah(nilai)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1" style={{ maxWidth: 420, marginLeft: "auto" }}>
      {baris("Jasa", jasa)}
      {baris("Sparepart", sparepart)}
      {baris("Biaya lain", lain)}
      <div className="divider" style={{ margin: "6px 0" }} />
      {baris("Total biaya", jasa + sparepart + lain, true)}
      {pelaksana === "asuransi" && (
        <>
          <div className="flex justify-between gap-3" style={{ fontSize: 13, color: "var(--brand-primary-dark)" }}>
            <span>Ditanggung asuransi{estimasi ? " (estimasi)" : ""}</span>
            <span>{formatRupiah(asuransi)}</span>
          </div>
          <div className="flex justify-between gap-3" style={{ fontSize: 13, fontWeight: 600 }}>
            <span>Ditanggung perusahaan</span>
            <span>{formatRupiah(perusahaan)}</span>
          </div>
        </>
      )}
    </div>
  );
}
