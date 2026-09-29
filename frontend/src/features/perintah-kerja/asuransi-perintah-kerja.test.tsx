/** Asuransi & perintah kerja: hitungan, validasi, payload, dan kartu Asuransi. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { tautanWhatsApp } from "@/lib/server-page";
import type { PolisAsuransi } from "@/features/asuransi/api";
import { KartuAsuransi, awalAsuransiForm, payloadAsuransi } from "@/features/asuransi/components/polis-aset";
import { POLIS_KOSONG, isianKePolis, periksaPolis } from "@/features/asuransi/components/polis-fields";
import { periksaPic } from "@/features/asuransi/components/asuransi-form";
import { hitungTanggungan } from "./tanggungan";

vi.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => ({ canManageOperational: true }) }));

const POLIS: PolisAsuransi = {
  id: "pol1",
  asuransi_id: "a1",
  asuransi_nama: "Asuransi Sinar",
  unit_id: "u1",
  unit_trailer_id: null,
  kode_aset: "SL29",
  nomor_polis: "POL-001",
  jenis_pertanggungan: "all_risk",
  mulai: "2026-01-01",
  berakhir: "2026-12-31",
  nilai_pertanggungan: 500_000_000,
  own_risk: 500_000,
  premi: null,
  catatan: null,
  polis_uploaded_at: null,
  polis_url: "https://x/polis.pdf",
  keadaan: "berlaku",
  sisa_hari: 20,
  pic_utama: {
    id: "p1",
    sapaan: "Bapak",
    nama: "Andi",
    jabatan: "Klaim",
    no_hp: "0812-3456-7890",
    email: null,
    is_utama: true
  }
};

describe("hitungTanggungan (sama dengan backend)", () => {
  it("bukan asuransi → seluruhnya perusahaan", () => {
    expect(hitungTanggungan(1_000_000, "bengkel", null)).toMatchObject({ asuransi: 0, perusahaan: 1_000_000 });
  });
  it("disetujui dikurangi own risk", () => {
    const t = hitungTanggungan(12_000_000, "asuransi", {
      status_klaim: "disetujui",
      nilai_diajukan: null,
      nilai_disetujui: 10_000_000,
      own_risk: 500_000
    });
    expect(t).toMatchObject({ asuransi: 9_500_000, perusahaan: 2_500_000, estimasi: false });
  });
  it("ditolak → perusahaan; diajukan → estimasi", () => {
    const base = { nilai_diajukan: null, nilai_disetujui: 3_000_000, own_risk: 300_000 };
    expect(hitungTanggungan(4_000_000, "asuransi", { ...base, status_klaim: "ditolak" })).toMatchObject({
      asuransi: 0,
      perusahaan: 4_000_000
    });
    expect(hitungTanggungan(4_000_000, "asuransi", { ...base, status_klaim: "survei" })).toMatchObject({
      asuransi: 3_700_000,
      perusahaan: 300_000,
      estimasi: true
    });
  });
});

describe("validasi & payload asuransi", () => {
  it("polis: asuransi, nomor, periode wajib; berakhir tidak sebelum mulai", () => {
    expect(Object.keys(periksaPolis(POLIS_KOSONG)).sort()).toEqual(["asuransi_id", "berakhir", "mulai", "nomor_polis"]);
    const e = periksaPolis({ ...POLIS_KOSONG, asuransi_id: "a1", nomor_polis: "P", mulai: "2026-05-01", berakhir: "2026-04-01" });
    expect(e).toEqual({ berakhir: "Tidak boleh sebelum tanggal mulai" });
  });

  it("isian polis → payload angka", () => {
    const p = isianKePolis({ ...POLIS_KOSONG, asuransi_id: "a1", nomor_polis: " P1 ", own_risk: "500000", mulai: "2026-01-01", berakhir: "2026-12-31" });
    expect(p).toMatchObject({ nomor_polis: "P1", own_risk: 500000, premi: null });
  });

  it("form aset: polis lama diubah, atau dihapus bila centang dilepas", () => {
    const awal = awalAsuransiForm(POLIS);
    expect(awal.aktif).toBe(true);
    expect(payloadAsuransi(awal, POLIS)).toMatchObject({ polis_id: "pol1", hapus_polis: false });
    expect(payloadAsuransi({ ...awal, aktif: false }, POLIS)).toEqual({ polis: null, polis_id: "pol1", hapus_polis: true });
    expect(payloadAsuransi(awalAsuransiForm(null), null)).toEqual({ polis: null, polis_id: null, hapus_polis: false });
  });

  it("PIC: nama & no HP wajib, no HP 8–15 digit", () => {
    const pic = { sapaan: null, jabatan: null, email: null, is_utama: true };
    expect(periksaPic([{ ...pic, nama: "", no_hp: "0812345678" }])).toEqual({ 0: "Nama PIC wajib diisi" });
    expect(periksaPic([{ ...pic, nama: "A", no_hp: "123" }])).toEqual({ 0: "No HP PIC tidak valid (8–15 digit)" });
    expect(periksaPic([{ ...pic, nama: "A", no_hp: "0812 3456 789" }])).toEqual({});
  });

  it("tautan WhatsApp dari nomor lokal", () => {
    expect(tautanWhatsApp("0812-3456-7890")).toBe("https://wa.me/6281234567890");
    expect(tautanWhatsApp("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
    expect(tautanWhatsApp("123")).toBeNull();
  });
});

describe("KartuAsuransi", () => {
  function tampil(polis: PolisAsuransi | null) {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <ToastProvider>
            <KartuAsuransi aset={{ unit_id: "u1" }} polis={polis} />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  it("menampilkan polis, PIC utama (WhatsApp), peringatan habis, dan tombol perpanjang", () => {
    tampil(POLIS);
    expect(screen.getByText("Asuransi Sinar").closest("a")?.getAttribute("href")).toBe("/asuransi/a1");
    expect(screen.getByText("POL-001")).toBeTruthy();
    expect(screen.getByText(/Habis 20 hari lagi/)).toBeTruthy();
    expect(screen.getByText("0812-3456-7890").closest("a")?.getAttribute("href")).toBe("https://wa.me/6281234567890");
    expect(screen.getByText("Lihat polis").closest("a")?.getAttribute("href")).toBe("https://x/polis.pdf");
    expect(screen.getByText("Perpanjang polis")).toBeTruthy();
  });

  it("tanpa polis: tombol tambah polis", () => {
    tampil(null);
    expect(screen.getByText("Belum ada polis asuransi.")).toBeTruthy();
    expect(screen.getByText("Tambah polis")).toBeTruthy();
  });
});
