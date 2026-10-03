/**
 * Detail proyek: filter daftar job Aktif / Semua, dan tombol Tambah job
 * nonaktif bila proyek sudah masuk tagihan aktif, dan daftar tagihan proyek
 * (termasuk yang batal) menggantikan info tagihan per job.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Job, ProyekDetail, ProyekTagihan } from "@/types";
import { formatRupiah } from "@/lib/utils";

const user = { role: "admin" };
vi.mock("@/lib/auth/AuthContext", () => ({ useCurrentUser: () => user }));

import { ProyekDetailView } from "./proyek-detail-view";

function job(id: string, status: string, menggantikan?: string): Job {
  return {
    id,
    job_number: `JOB-${id}`,
    status,
    menggantikan_job_id: menggantikan ?? null,
    alat_diangkut: "Excavator",
    asal: "A",
    tujuan: "B",
    etd: "2026-10-01T01:00:00Z",
    unit_id: "u1",
    driver_id: "d1",
    customer_id: "c1"
  } as unknown as Job;
}

function proyek(jobs: Job[]): ProyekDetail {
  return {
    id: "p1",
    nomor_proyek: "001/PRJ/MAS/X/2026",
    customer_id: "c1",
    customer_nama: "PT A",
    created_at: "2026-10-01T00:00:00Z",
    jumlah_job: jobs.length,
    jumlah_job_selesai: 0,
    jumlah_job_batal: 0,
    jobs
  } as unknown as ProyekDetail;
}

/** Kartu sebuah bagian berdasarkan judul kepalanya ("Job di proyek ini" / "Tagihan"). */
const bagian = (judul: string) => within(screen.getByText(judul).closest(".card") as HTMLElement);

function tampil(p: ProyekDetail, hanyaLihat = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProyekDetailView proyek={p} hanyaLihat={hanyaLihat} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("filter job Aktif / Semua", () => {
  it("default Aktif: job dibatalkan disembunyikan; Semua menampilkannya", () => {
    tampil(proyek([job("A", "selesai"), job("B", "cancelled")]));
    expect(screen.getByText("JOB-A")).toBeTruthy();
    expect(screen.queryByText("JOB-B")).toBeNull();
    fireEvent.click(bagian("Job di proyek ini").getByRole("button", { name: /Semua/ }));
    expect(screen.getByText("JOB-B")).toBeTruthy();
  });
});

describe("tombol Tambah job", () => {
  it("aktif bila proyek belum masuk tagihan aktif", () => {
    tampil(proyek([job("A", "selesai")]));
    const tombol = screen.getByRole("button", { name: /Tambah job/ }) as HTMLButtonElement;
    expect(tombol.disabled).toBe(false);
  });

  it("nonaktif bila proyek sudah masuk tagihan aktif", () => {
    tampil({ ...proyek([job("A", "selesai")]), invoice_id: "i1", invoice_number: "INV-001" });
    const tombol = screen.getByRole("button", { name: /Tambah job/ }) as HTMLButtonElement;
    expect(tombol.disabled).toBe(true);
    expect(tombol.title).toMatch(/sudah masuk tagihan INV-001/);
  });
});

function tagihan(id: string, nomor: string, isi: Partial<ProyekTagihan> = {}): ProyekTagihan {
  return {
    id,
    invoice_number: nomor,
    tanggal: "2026-10-02",
    created_at: "2026-10-02T01:00:00Z",
    status_tampil: "terkirim",
    status_bayar: "unpaid",
    alasan_batal: null,
    total: null,
    dibayar: null,
    sisa: null,
    ...isi
  };
}

describe("daftar tagihan proyek", () => {
  it("default Aktif: tagihan batal disembunyikan; Semua menampilkannya", () => {
    user.role = "admin";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [tagihan("i1", "INV-001", { status_tampil: "batal" }), tagihan("i2", "INV-002")];
    tampil(p);
    expect(screen.queryByText(/^INV-001/)).toBeNull();
    expect(screen.getByText(/^INV-002/)).toBeTruthy();
    expect(bagian("Tagihan").getByRole("button", { name: "Aktif (1)" })).toBeTruthy();
    fireEvent.click(bagian("Tagihan").getByRole("button", { name: "Semua (2)" }));
    expect(screen.getByText(/^INV-001/)).toBeTruthy();
  });

  it("edge: semua tagihan batal → filter Aktif menampilkan keterangan", () => {
    user.role = "admin";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [tagihan("i1", "INV-001", { status_tampil: "batal" })];
    tampil(p);
    expect(screen.getByText("Tidak ada tagihan aktif — semua tagihan proyek ini dibatalkan.")).toBeTruthy();
  });

  it("sukses: di Semua, tagihan urut dari backend, yang batal kelihatan beserta alasannya", () => {
    user.role = "admin";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [
      tagihan("i1", "INV-001", { status_tampil: "batal", alasan_batal: "Salah harga" }),
      tagihan("i2", "INV-002")
    ];
    tampil(p);
    fireEvent.click(bagian("Tagihan").getByRole("button", { name: "Semua (2)" }));
    const nomor = screen.getAllByText(/^INV-00\d/).map((el) => el.textContent?.slice(0, 7));
    expect(nomor).toEqual(["INV-001", "INV-002"]);
    expect(screen.getByText("Alasan batal: Salah harga")).toBeTruthy();
    // Admin: tanpa tautan & tanpa nominal.
    expect(screen.queryByRole("link", { name: /INV-002/ })).toBeNull();
  });

  it("superadmin/finance: baris tagihan bisa dibuka + nominal", () => {
    user.role = "finance";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [tagihan("i2", "INV-002", { total: 1_110_000, dibayar: 0, sisa: 1_110_000 })];
    tampil(p, true);
    expect(screen.getByRole("link", { name: /INV-002/ }).getAttribute("href")).toBe("/invoices/i2");
  });

  it("edge: belum ada tagihan → teks kosong; operator tidak melihat bagian tagihan", () => {
    user.role = "admin";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [];
    tampil(p);
    expect(screen.getByText("Belum ada tagihan untuk proyek ini.")).toBeTruthy();
  });

  it("operator: bagian tagihan disembunyikan", () => {
    user.role = "operator";
    const p = proyek([job("A", "selesai")]);
    p.tagihan = [];
    tampil(p, true);
    expect(screen.queryByText("Belum ada tagihan untuk proyek ini.")).toBeNull();
    user.role = "admin";
  });
});

describe("uang jalan & biaya lain per job", () => {
  const rapi = (t: string | null) => (t ?? "").replace(/\s/g, " ");

  it("kolom uang jalan (cair / job, sisa) & biaya lain di samping tiap job; baris Total tanpa job batal", () => {
    user.role = "admin";
    const p = proyek([job("A", "selesai"), job("B", "dalam_perjalanan"), job("C", "cancelled")]);
    p.biaya_job = {
      A: { uang_jalan: 2_000_000, cair: 2_000_000, sisa: 0, biaya_lain: 30_000 },
      B: { uang_jalan: 1_500_000, cair: 500_000, sisa: 1_000_000, biaya_lain: 0 },
      // Job dibatalkan tidak ikut total proyek.
      C: { uang_jalan: 9_000_000, cair: 9_000_000, sisa: 0, biaya_lain: 9_000 }
    };
    tampil(p);
    const daftar = bagian("Job di proyek ini");
    expect(daftar.getByText("Uang jalan (cair / job)")).toBeTruthy();
    expect(daftar.getByText("Biaya lain")).toBeTruthy();

    const barisA = rapi(screen.getByText("JOB-A").closest("a")!.textContent);
    expect(barisA).toContain(rapi(`${formatRupiah(2_000_000)}dari ${formatRupiah(2_000_000)}`));
    expect(barisA).toContain(rapi(formatRupiah(30_000)));
    const barisB = rapi(screen.getByText("JOB-B").closest("a")!.textContent);
    expect(barisB).toContain(rapi(`sisa ${formatRupiah(1_000_000)}`));

    const total = rapi(daftar.getByText("Total").parentElement!.textContent);
    expect(total).toContain(rapi(`${formatRupiah(2_500_000)}dari ${formatRupiah(3_500_000)}`));
    expect(total).toContain(rapi(formatRupiah(30_000)));
  });

  it("asal & tujuan masing-masing satu baris dengan ikonnya", () => {
    user.role = "admin";
    tampil(proyek([job("A", "selesai")]));
    const asal = screen.getByText("A", { selector: "div.caption" });
    const tujuan = screen.getByText("B", { selector: "div.caption" });
    expect(asal.querySelector("svg")).not.toBeNull();
    expect(tujuan.querySelector("svg")).not.toBeNull();
    expect(asal).not.toBe(tujuan);
  });
});
