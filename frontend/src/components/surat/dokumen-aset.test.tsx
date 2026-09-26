import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BastPenjualanView, SuratPenjualanView } from "@/features/penjualan-unit/components/dokumen-penjualan";
import { BeritaAcaraPenghapusanView } from "@/features/penghapusan-aset/components/berita-acara-penghapusan";
import type { PenjualanUnit } from "@/features/penjualan-unit/api";
import type { PenghapusanAset } from "@/features/penghapusan-aset/api";
import { terbilangRupiah } from "@/lib/surat";

const ASET = {
  kode: "TR-01",
  jenis_nama: "Lowbed",
  no_polisi: "B 1234 XY",
  tahun: 2019,
  kapasitas_ton: null,
  stnk_nomor: "STNK-1",
  kir_nomor: "KIR-9",
  srut_nomor: null
};

const JUAL: PenjualanUnit = {
  id: "p1",
  nomor_surat: "0001/SPJ/MAS/IX/2026",
  nomor_bast: "0001/BAST/MAS/IX/2026",
  jenis_aset: "unit",
  unit_id: "u1",
  unit_trailer_id: null,
  kode_aset: "TR-01",
  nama_pembeli: "PT Maju Jaya",
  no_hp_pembeli: "081234567890",
  email_pembeli: null,
  penyerah_nama: "Budi Santoso",
  penyerah_jabatan: "Kepala Pool",
  harga_jual: 150_000_000,
  tanggal_jual: "2026-09-26",
  catatan: null,
  bukti_uploaded_at: null,
  bukti_bast_uploaded_at: null,
  bukti_url: null,
  bukti_bast_url: null,
  created_by_nama: "Admin",
  created_at: "2026-09-26T03:00:00Z",
  aset: ASET
};

function tampil(ui: React.ReactNode) {
  render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("dokumen aset", () => {
  it("surat penjualan: nomor otomatis, pembeli, rincian aset, harga & terbilang", () => {
    tampil(<SuratPenjualanView penjualan={JUAL} />);
    expect(screen.getByText("SURAT PENJUALAN ASET")).toBeTruthy();
    expect(screen.getByText("Nomor: 0001/SPJ/MAS/IX/2026")).toBeTruthy();
    expect(screen.getAllByText("PT Maju Jaya").length).toBeGreaterThan(0);
    expect(screen.getByText("B 1234 XY")).toBeTruthy();
    expect(screen.getByText("Rp. 150.000.000,-")).toBeTruthy();
    expect(screen.getByText("Seratus lima puluh juta rupiah")).toBeTruthy();
    // Merujuk BAST-nya.
    expect(screen.getByText(/0001\/BAST\/MAS\/IX\/2026/)).toBeTruthy();
  });

  it("BAST: hari & tanggal, rujukan surat penjualan, kelengkapan dokumen", () => {
    tampil(<BastPenjualanView penjualan={JUAL} />);
    expect(screen.getByText("BERITA ACARA SERAH TERIMA ASET")).toBeTruthy();
    expect(screen.getByText("Nomor: 0001/BAST/MAS/IX/2026")).toBeTruthy();
    expect(screen.getByText("Sabtu")).toBeTruthy(); // 26 Sep 2026
    expect(screen.getByText(/Surat Penjualan Aset Nomor 0001\/SPJ\/MAS\/IX\/2026/)).toBeTruthy();
    expect(screen.getByText(/STNK No\. STNK-1/)).toBeTruthy();
    // Penyerah tercetak di PIHAK PERTAMA & tanda tangannya.
    expect(screen.getByText(/diwakili oleh Budi Santoso \(Kepala Pool\)/)).toBeTruthy();
    expect(screen.getByText("Budi Santoso")).toBeTruthy();
  });

  it("berita acara penghapusan: nomor, alasan, status Diafkirkan", () => {
    const hapus: PenghapusanAset = {
      id: "h1",
      nomor_berita_acara: "0001/BAP/MAS/IX/2026",
      jenis_aset: "unit_trailer",
      unit_id: null,
      unit_trailer_id: "t1",
      kode_aset: "TL-01",
      tanggal_hapus: "2026-09-26",
      alasan: "Rangka retak, tidak ekonomis diperbaiki",
      catatan: null,
      status_aset_sebelum: "breakdown",
      bukti_uploaded_at: null,
      bukti_url: null,
      created_by_nama: "Admin",
      created_at: "2026-09-26T03:00:00Z",
      aset: { ...ASET, kode: "TL-01", no_polisi: null, stnk_nomor: null, kapasitas_ton: 40, srut_nomor: "SRUT-2" }
    };
    tampil(<BeritaAcaraPenghapusanView penghapusan={hapus} />);
    expect(screen.getByText("BERITA ACARA PENGHAPUSAN ASET")).toBeTruthy();
    expect(screen.getByText("Nomor: 0001/BAP/MAS/IX/2026")).toBeTruthy();
    expect(screen.getByText("Rangka retak, tidak ekonomis diperbaiki")).toBeTruthy();
    expect(screen.getByText("40 ton")).toBeTruthy();
    expect(screen.getByText("Diafkirkan")).toBeTruthy();
  });

  it("terbilang rupiah", () => {
    expect(terbilangRupiah(1_250_500)).toBe("Satu juta dua ratus lima puluh ribu lima ratus rupiah");
  });
});
