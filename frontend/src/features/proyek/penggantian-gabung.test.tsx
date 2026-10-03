/**
 * - Penggantian saat job berjalan: hanya status berjalan; ganti driver
 *   memeriksa pengembalian + kasbon ≤ uang jalan cair & kas penerima.
 * - Form proyek dari penawaran: unit yang sudah punya proyek dari penawaran
 *   yang sama → job digabung ke proyek itu; belum → proyek baru.
 * - Form proyek: job baru di proyek yang sudah ada memakai unit proyek.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { GantiDriverModal, bolehPenggantian } from "@/features/jobs/components/penggantian-modal";
import { ProyekFormView } from "@/features/proyek/components/proyek-form-view";
import type { Driver, Job, ProyekDetail, Quotation, QuotationItem, Unit } from "@/types";

const UNIT = {
  id: "u1",
  kode_unit: "MAS-01",
  jenis_unit_id: "j1",
  jenis_unit_nama: "Tronton",
  no_polisi: "BM 1",
  status: "bertugas",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z"
} as Unit;
const UNIT_2 = { ...UNIT, id: "u2", kode_unit: "MAS-02", status: "standby" } as Unit;

const JOB = {
  id: "j1",
  job_number: "JOB-001",
  share_token: "t",
  customer_id: "c1",
  customer_nama: "PT A",
  alat_diangkut: "Excavator",
  asal: "A",
  tujuan: "B",
  unit_id: "u1",
  driver_id: "d1",
  etd: "2026-10-01T01:00:00Z",
  status: "dalam_perjalanan",
  created_at: "2026-10-01T00:00:00Z",
  uang_jalan_cair: 1000000,
  photos: []
} as unknown as Job;

function stubFetch(respon: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Pilihan unit trailer per unit selalu berbentuk objek di API asli.
      const body = url.includes("/unit-trailer/untuk-unit") ? { wajib: false, trailer: [] } : respon(url);
      return new Response(JSON.stringify(body ?? null), { status: 200, headers: { "Content-Type": "application/json" } });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function bungkus(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("Penggantian saat job berjalan", () => {
  it("hanya untuk job yang sedang berjalan", () => {
    for (const s of ["diterima", "loading", "dalam_perjalanan", "unloading", "serah_terima_pool"] as const)
      expect(bolehPenggantian({ status: s })).toBe(true);
    for (const s of ["ditugaskan", "menunggu_validasi", "selesai", "cancelled"] as const)
      expect(bolehPenggantian({ status: s })).toBe(false);
  });

  it("ganti driver: pengembalian + kasbon tidak boleh melebihi uang jalan yang sudah cair", async () => {
    stubFetch(() => []);
    bungkus(<GantiDriverModal job={JOB} driverNama="Agus" onClose={() => {}} />);
    expect(screen.getByText(/Sudah cair Rp\s?1\.000\.000/)).toBeTruthy();
    const kasbon = screen.getByText("Dijadikan kasbon supir").closest(".field")!.querySelector("input")!;
    fireEvent.change(kasbon, { target: { value: "2000000" } });
    fireEvent.submit(document.querySelector("#ganti-driver-form")!);
    expect(await screen.findByText(/melebihi uang jalan yang sudah cair/)).toBeTruthy();
    expect(screen.getByText("Pilih driver pengganti")).toBeTruthy();
  });
});

const ITEM = {
  id: "it1",
  urutan: 1,
  dari: "Pekanbaru",
  tujuan: "Dumai",
  qty: 1,
  satuan: "Unit",
  nama_alat: "Excavator",
  jenis_unit_id: "j1",
  harga_satuan: 1,
  subtotal: 1,
  keputusan: "deal",
  harga_final: 1,
  subtotal_final: 1,
  jumlah_job: 0
} as unknown as QuotationItem;
const QUOTATION = { id: "q1", quote_number: "0001/SK/MAS/X/2026", customer_nama: "PT A", items: [ITEM] } as unknown as Quotation;

const PROYEK_LAIN = {
  id: "pr9",
  nomor_proyek: "003/PRJ/MAS/X/2026",
  customer_id: "c1",
  customer_nama: "PT A",
  pic_nama: "Budi",
  pic_no_hp: "081211112222",
  created_by_nama: null,
  created_at: "2026-10-01T00:00:00Z",
  jumlah_job: 1,
  jumlah_job_selesai: 0,
  jumlah_job_batal: 0,
  invoice_id: null,
  invoice_number: null,
  unit_kode: "MAS-01",
  quote_number: "0001/SK/MAS/X/2026",
  jobs: [],
  tagihan: []
} as ProyekDetail;

function renderDariPenawaran(unitAwal: string) {
  return bungkus(
    <ProyekFormView
      customers={[]}
      drivers={[]}
      units={[UNIT, UNIT_2]}
      activeJobs={[]}
      penawaran={QUOTATION}
      unitAwal={unitAwal}
      prefill={{
        quotation_id: "q1",
        quotation_item_id: "it1",
        quote_number: "0001/SK/MAS/X/2026",
        item_label: "item 1: Pekanbaru → Dumai",
        customer_id: "c1",
        pic_nama: "Budi",
        pic_no_hp: "081211112222",
        alat_diangkut: "Excavator",
        asal: "Pekanbaru",
        tujuan: "Dumai"
      }}
    />
  );
}

describe("Form proyek dari penawaran: cek gabung saat unit dipilih", () => {
  it("unit yang sudah punya proyek dari penawaran ini → checkbox gabung otomatis tercentang", async () => {
    stubFetch((url) =>
      url.includes("/proyek/cari")
        ? { id: "pr9", nomor_proyek: "003/PRJ/MAS/X/2026" }
        : url.includes("/proyek/pr9")
          ? PROYEK_LAIN
          : []
    );
    renderDariPenawaran("u1");
    // Selama mencari, halaman dibekukan popup loading.
    expect(screen.getByText("Mencari proyek dari penawaran & unit yang sama…")).toBeTruthy();
    const centang = (await screen.findByText(/yang sudah ada/)).closest("label")!.querySelector("input")!;
    // Ditemukan → otomatis dicentang; masih bisa dilepas (proyek baru).
    await waitFor(() => expect(centang.checked).toBe(true));
    // PIC ikut proyek tujuan.
    expect(screen.getByDisplayValue("Budi")).toBeTruthy();
    // Customer dari penawaran (terkunci), PIC tetap bisa diubah; kosongan disembunyikan.
    expect(screen.getByLabelText(/Jalan kosongan/, { selector: "input" }).closest("label")!.hidden).toBe(true);
    fireEvent.click(centang);
    expect(centang.checked).toBe(false);
  });

  it("unit tanpa proyek dari penawaran ini → tidak ada checkbox gabung", async () => {
    stubFetch((url) => (url.includes("/proyek/cari") ? null : []));
    renderDariPenawaran("u2");
    await waitFor(() => expect(screen.queryByText(/Mencari proyek dari penawaran/)).toBeNull());
    expect(screen.queryByText(/yang sudah ada/)).toBeNull();
    expect(screen.getByRole("button", { name: "Lanjut ke review" })).toBeTruthy();
  });

  it("pilihan unit hanya unit Stand by", () => {
    stubFetch(() => []);
    renderDariPenawaran("");
    const trigger = screen.getByText("Dipakai semua job proyek ini.").closest(".field")!.querySelector<HTMLButtonElement>(".combobox-trigger")!;
    fireEvent.click(trigger);
    const daftar = screen.getByRole("listbox");
    expect(daftar.textContent).toContain("MAS-02"); // Stand by
    expect(daftar.textContent).not.toContain("MAS-01"); // sedang bertugas
  });

  it("unit dipilih di bagian proyek, bukan di job", async () => {
    stubFetch((url) => (url.includes("/proyek/cari") ? null : []));
    renderDariPenawaran("u2");
    expect(screen.getByText("Dipakai semua job proyek ini.")).toBeTruthy();
    expect(screen.queryByText("Mengikuti unit proyek (1 proyek = 1 unit).")).toBeNull();
    // Tambah proyek cukup 1 job.
    expect(screen.queryByRole("button", { name: /Tambah job/ })).toBeNull();
  });
});

describe("Tambah proyek dari penawaran: cukup 1 job", () => {
  it("tanpa tombol Tambah job walau masih ada item deal lain", async () => {
    stubFetch((url) => (url.includes("/proyek/cari") ? null : []));
    const penawaran = {
      ...QUOTATION,
      items: [
        ITEM,
        { ...ITEM, id: "it2", dari: "Dumai", tujuan: "Duri" },
        { ...ITEM, id: "it3", dari: "Siak", tujuan: "Bengkalis", jenis_unit_id: "j-lain" }
      ]
    } as unknown as Quotation;
    bungkus(
      <ProyekFormView
        customers={[]}
        drivers={[]}
        units={[UNIT, UNIT_2]}
        activeJobs={[]}
        penawaran={penawaran}
        prefill={{
          quotation_id: "q1",
          quotation_item_id: "it1",
          quote_number: "0001/SK/MAS/X/2026",
          item_label: "item 1: Pekanbaru → Dumai",
          customer_id: "c1",
          alat_diangkut: "Excavator",
          asal: "Pekanbaru",
          tujuan: "Dumai"
        }}
      />
    );
    // Masih ada item deal lain, tetapi tambah proyek cukup 1 job.
    expect(screen.getByText("Detail Pengiriman")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tambah job/ })).toBeNull();
  });
});

describe("Form proyek: unit job baru mengikuti unit proyek", () => {
  it("job tambahan di proyek yang sudah ada terkunci ke unit proyek", () => {
    stubFetch(() => []);
    const proyek = {
      id: "pr1",
      nomor_proyek: "001/PRJ/MAS/X/2026",
      customer_id: "c1",
      customer_nama: "PT A",
      pic_nama: "Budi",
      pic_no_hp: "081211112222",
      created_by_nama: null,
      created_at: "2026-10-01T00:00:00Z",
      jumlah_job: 1,
      jumlah_job_selesai: 0,
      jumlah_job_batal: 0,
      invoice_id: null,
      invoice_number: null,
      unit_kode: "MAS-01",
      quote_number: null,
      jobs: [JOB]
    } as ProyekDetail;
    bungkus(
      <ProyekFormView
        proyek={proyek}
        customers={[]}
        drivers={[{ id: "d1", nama: "Agus", no_hp: "0812" } as Driver]}
        units={[UNIT, UNIT_2]}
        activeJobs={[]}
        tambahJob
      />
    );
    expect(screen.getByText("Mengikuti unit proyek (1 proyek = 1 unit).")).toBeTruthy();
    // Unit sudah terisi MAS-01 (unit proyek) walau unit itu sedang bertugas.
    expect(screen.getAllByText(/MAS-01 — Tronton/).length).toBeGreaterThan(0);
  });
});
