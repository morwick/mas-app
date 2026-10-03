/**
 * Form proyek (menggantikan form tambah job):
 * - Customer boleh kosong (unit jalan kosongan); PIC & No HP opsional,
 *   terisi otomatis dari master tapi bisa ditimpa;
 * - job diisi lewat accordion (Detail Pengiriman, Assign Unit & Driver,
 *   Catatan Internal) dan bisa ditambah; proyek baru minimal 1 job.
 * Form edit job tidak lagi memuat customer / PIC (milik proyek).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { EditJobView } from "@/features/jobs/components/edit-job-view";
import { ProyekFormView } from "@/features/proyek/components/proyek-form-view";
import { ProyekReview } from "@/features/proyek/components/proyek-review";
import { jobDraftBaru } from "@/features/proyek/job-draft";
import type { Customer, Driver, Job, ProyekDetail, Unit } from "@/types";

const CUSTOMERS = [
  {
    id: "c1",
    nama_perusahaan: "PT Anugerah Jaya",
    kota: "Surabaya",
    pic_nama: "Budi Santoso",
    pic_no_hp: "081211112222",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z"
  },
  {
    id: "c2",
    nama_perusahaan: "PT Bumi Sentosa",
    kota: "Jakarta",
    pic_nama: "Siti Rahma",
    pic_no_hp: "081233334444",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z"
  },
  {
    // Belum punya PIC di master — admin harus mengisinya manual.
    id: "c3",
    nama_perusahaan: "CV Karya Mandiri",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z"
  }
] as Customer[];

const DRIVERS = [
  { id: "d1", nama: "Agus", no_hp: "081200000001", is_active: true, created_at: "2026-01-01T00:00:00Z", status: "stand_by" }
] as Driver[];

const UNITS = [
  {
    id: "u1",
    kode_unit: "MAS-01",
    jenis_unit_id: "j1",
    jenis_unit_nama: "Tronton",
    no_polisi: "L 1234 AB",
    status: "standby",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    odometer_baseline_km: 0,
    current_odometer_km: 0,
    service_interval_km: 10000
  }
] as Unit[];

const JOB = {
  id: "j1",
  job_number: "JOB-001",
  share_token: "tok",
  customer_id: "c1",
  customer_nama: "PT Anugerah Jaya",
  pic_nama: "Budi Santoso",
  pic_no_hp: "081211112222",
  proyek_id: "pr1",
  proyek_nomor: "001/PRJ/MAS/X/2026",
  alat_diangkut: "Excavator",
  asal: "Gudang A",
  tujuan: "Proyek B",
  unit_id: "u1",
  driver_id: "d1",
  etd: "2026-10-01T01:00:00Z",
  status: "ditugaskan",
  created_at: "2026-09-01T00:00:00Z",
  eta_is_estimated: false,
  photos: []
} as unknown as Job;

const PROYEK = {
  id: "pr1",
  nomor_proyek: "001/PRJ/MAS/X/2026",
  customer_id: "c1",
  customer_nama: "PT Anugerah Jaya",
  pic_nama: "Budi Santoso",
  pic_no_hp: "081211112222",
  created_by_nama: "Admin",
  created_at: "2026-10-01T00:00:00Z",
  jumlah_job: 1,
  jumlah_job_selesai: 0,
  jumlah_job_batal: 0,
  invoice_id: null,
  invoice_number: null,
  jobs: [JOB]
} as ProyekDetail;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Semua panggilan API digagalkan: test ini soal tampilan & validasi klien.
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ detail: "tidak diharapkan" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

function renderBaru() {
  return bungkus(<ProyekFormView customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} />);
}

function picInputs() {
  const ambil = (re: RegExp) =>
    screen.getByText(re).closest(".field")!.querySelector("input")! as HTMLInputElement;
  return { nama: ambil(/^PIC di lapangan/), noHp: ambil(/^No HP PIC/) };
}

/** Combobox pertama di form = customer. */
function pilihCustomer(nama: string) {
  fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".combobox-trigger")[0]);
  fireEvent.click(within(screen.getByRole("listbox")).getByText(nama));
}

function submit() {
  fireEvent.submit(document.querySelector("form")!);
}

/** Request simpan proyek (fetch lain: posisi GPS unit saat form dibuka). */
function postProyek() {
  return fetchMock.mock.calls.filter(([input, init]) => String(input).includes("/proyek") && (init as RequestInit)?.method === "POST");
}

describe("Customer & PIC proyek", () => {
  it("tanpa centang Jalan kosongan, customer wajib dipilih", () => {
    renderBaru();
    submit();
    expect(screen.getByText(/Customer wajib dipilih/)).toBeTruthy();
    expect(postProyek()).toHaveLength(0);
  });

  it("centang Jalan kosongan menyembunyikan customer & tombol customer baru", () => {
    renderBaru();
    expect(screen.getByRole("button", { name: /Customer baru/ })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Jalan kosongan/));
    expect(screen.queryByRole("button", { name: /Customer baru/ })).toBeNull();
    expect(screen.queryByText("Pilih customer")).toBeNull();
    submit();
    expect(screen.queryByText(/Customer wajib dipilih/)).toBeNull();
    expect(screen.queryByText("PIC wajib diisi")).toBeNull();
  });

  it("form proyek baru punya 2 langkah: isi data lalu review", () => {
    renderBaru();
    expect(screen.getByText("Isi data proyek & job")).toBeTruthy();
    expect(screen.getByText("Review & simpan")).toBeTruthy();
    // Isian belum lengkap → tetap di langkah 1, tidak ada yang dikirim.
    fireEvent.click(screen.getByRole("button", { name: "Lanjut ke review" }));
    expect(screen.queryByRole("button", { name: "Simpan proyek" })).toBeNull();
    expect(postProyek()).toHaveLength(0);
  });

  it("mengisi PIC & No HP dari master saat customer dipilih, dan mengganti saat customer diganti", () => {
    renderBaru();
    pilihCustomer("PT Anugerah Jaya");
    expect(picInputs().nama.value).toBe("Budi Santoso");
    expect(picInputs().noHp.value).toBe("081211112222");
    pilihCustomer("PT Bumi Sentosa");
    expect(picInputs().nama.value).toBe("Siti Rahma");
  });

  it("isian hasil auto-isi tetap bisa diubah manual", () => {
    renderBaru();
    pilihCustomer("PT Anugerah Jaya");
    fireEvent.change(picInputs().nama, { target: { value: "Pak Joko (mandor)" } });
    expect(picInputs().nama.value).toBe("Pak Joko (mandor)");
  });

  it("PIC & No HP opsional walau customer dipilih", () => {
    renderBaru();
    pilihCustomer("CV Karya Mandiri");
    submit();
    expect(screen.queryByText(/PIC wajib diisi/)).toBeNull();
    expect(screen.queryByText(/No HP PIC wajib diisi/)).toBeNull();
  });

  it("menolak No HP PIC dengan format salah", () => {
    renderBaru();
    pilihCustomer("PT Anugerah Jaya");
    fireEvent.change(picInputs().noHp, { target: { value: "12345" } });
    submit();
    expect(screen.getByText(/Format: 08xxxxxxxxxx/)).toBeTruthy();
  });

  it("customer baru dari form langsung jadi customer & PIC proyek", async () => {
    fetchMock.mockImplementation(
      async (url: string | URL | Request) =>
        // Daftar sales ikut dimuat ulang setelah customer baru tersimpan.
        new Response(
          JSON.stringify(String(url).includes("/sales") ? [] : { id: "cbaru", nama_perusahaan: "PT Baru Jaya" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    renderBaru();
    fireEvent.click(screen.getByRole("button", { name: /Customer baru/ }));
    const isi = (re: RegExp, v: string) =>
      fireEvent.change(screen.getByText(re).closest(".field")!.querySelector("input")!, { target: { value: v } });
    isi(/^Nama perusahaan/, "PT Baru Jaya");
    isi(/^PIC$/, "Rudi Hartono");
    isi(/^No telepon PIC/, "081255556666");
    fireEvent.click(screen.getByRole("button", { name: /Simpan & pilih/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(picInputs().nama.value).toBe("Rudi Hartono"));
    expect(picInputs().noHp.value).toBe("081255556666");
  });
});

describe("Form tambah proyek: 1 job tanpa accordion", () => {
  it("tanpa judul Job 1; tiga bagian langsung tampil berurutan", () => {
    renderBaru();
    expect(screen.queryByText("Job 1")).toBeNull();
    expect(screen.getByText("Detail Pengiriman")).toBeTruthy();
    expect(screen.getByText("Assign Unit & Driver")).toBeTruthy();
    expect(screen.getByText("Catatan Internal")).toBeTruthy();
    // Bukan accordion: tidak ada tombol buka/tutup bagian & tombol "Lanjut ke …".
    expect(screen.queryByRole("button", { name: /Detail Pengiriman/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Lanjut ke Unit & Driver/ })).toBeNull();
    // Isian semua bagian langsung bisa diisi.
    expect(screen.getByLabelText("Catatan internal")).toBeTruthy();
  });

  it("tambah proyek cukup 1 job: tanpa tombol Tambah job, job tunggal tidak bisa dihapus", () => {
    renderBaru();
    expect(screen.queryByRole("button", { name: /Tambah job/ })).toBeNull();
    expect(screen.queryByTitle("Hapus job ini dari form")).toBeNull();
    expect(screen.queryByText("Job 2")).toBeNull();
  });

  it("isian job yang kosong ditandai saat simpan dan tidak dikirim", () => {
    renderBaru();
    submit();
    expect(screen.getByText("Alat wajib diisi")).toBeTruthy();
    expect(screen.getByText("Unit wajib dipilih")).toBeTruthy();
    expect(screen.getByText("Uang jalan wajib diisi")).toBeTruthy();
    expect(postProyek()).toHaveLength(0);
  });
});

describe("Review proyek (langkah 2)", () => {
  it("menampilkan ringkasan proyek & job, tombol Ubah kembali ke job itu", () => {
    const draft = jobDraftBaru({
      alat_diangkut: "Excavator",
      asal: "Pekanbaru",
      tujuan: "Dumai",
      unit_id: "u1",
      driver_id: "d1",
      etd: "2099-01-01T08:00",
      uang_jalan_awal: "2500000"
    });
    const onUbah = vi.fn();
    bungkus(
      <ProyekReview
        kosongan
        customerNama={null}
        picNama=""
        picNoHp=""
        drafts={[draft]}
        metas={{ [draft.key]: { trailerWajib: false, trailerPending: false, etaTidakTerhitung: false, trailerKode: "TR-01" } }}
        units={UNITS}
        drivers={DRIVERS}
        onUbah={onUbah}
      />
    );
    expect(screen.getByText("Jalan kosongan (tanpa customer)")).toBeTruthy();
    expect(screen.getByText("Excavator")).toBeTruthy();
    expect(screen.getByText(/MAS-01 — Tronton \+ trailer TR-01/)).toBeTruthy();
    expect(screen.getByText("Dihitung otomatis dari rute")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Ubah/ })[1]);
    expect(onUbah).toHaveBeenCalledWith(draft.key);
  });
});

describe("Edit proyek", () => {
  it("halaman tambah job: job tersimpan tampil tanpa Ubah job, job baru siap diisi, PIC hanya dilihat", () => {
    bungkus(
      <ProyekFormView proyek={PROYEK} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} tambahJob />
    );
    expect(screen.getByText("Tambah job ke proyek 001/PRJ/MAS/X/2026")).toBeTruthy();
    expect(screen.getByText("JOB-001")).toBeTruthy();
    expect(screen.queryByText(/Ubah job/)).toBeNull();
    expect(screen.getByText("Job 2")).toBeTruthy();
    expect(picInputs().nama.value).toBe("Budi Santoso");
    expect(picInputs().nama.disabled).toBe(true);
  });

  it("edit proyek: job yang dibatalkan tidak ditampilkan", () => {
    const batal = { ...JOB, id: "j-batal", job_number: "JOB-BATAL", status: "cancelled" } as Job;
    bungkus(
      <ProyekFormView proyek={{ ...PROYEK, jobs: [JOB, batal] }} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} />
    );
    expect(screen.getByText("JOB-001")).toBeTruthy();
    expect(screen.queryByText("JOB-BATAL")).toBeNull();
  });

  it("accordion job tersimpan: detail pengiriman berlabel (alat, rute asal → tujuan, ETD/ETA)", () => {
    bungkus(
      <ProyekFormView proyek={PROYEK} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} tambahJob />
    );
    fireEvent.click(screen.getByRole("button", { name: /JOB-001/ }));
    expect(screen.getByText("Detail pengiriman")).toBeTruthy();
    expect(screen.getByText("Alat diangkut")).toBeTruthy();
    expect(screen.getByText("Rute")).toBeTruthy();
    expect(screen.getByText("Asal")).toBeTruthy();
    expect(screen.getByText("Tujuan")).toBeTruthy();
    expect(screen.getByText("ETD")).toBeTruthy();
    expect(screen.getByText("ETA")).toBeTruthy();
  });

  it("halaman tambah job: job yang dibatalkan tidak ditampilkan", () => {
    const batal = { ...JOB, id: "j-batal", job_number: "JOB-BATAL", status: "cancelled" } as Job;
    bungkus(
      <ProyekFormView
        proyek={{ ...PROYEK, jobs: [JOB, batal] }}
        customers={CUSTOMERS}
        drivers={DRIVERS}
        units={UNITS}
        activeJobs={[]}
        tambahJob
      />
    );
    expect(screen.getByText("JOB-001")).toBeTruthy();
    expect(screen.queryByText("JOB-BATAL")).toBeNull();
    // Job baru dinomori setelah job yang tampil saja.
    expect(screen.getByText("Job 2")).toBeTruthy();
  });

  it("edit proyek: hanya PIC yang bisa diubah; daftar job tampil tanpa tombol Tambah / Ubah job", () => {
    bungkus(<ProyekFormView proyek={PROYEK} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} />);
    expect(screen.getByText("Proyek 001/PRJ/MAS/X/2026")).toBeTruthy();
    expect(screen.getByText("JOB-001")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tambah job/ })).toBeNull();
    expect(screen.queryByText(/Ubah job/)).toBeNull();
    expect(screen.queryByText("Job 2")).toBeNull();
    expect(picInputs().nama.disabled).toBe(false);
    expect(screen.getByText(/yang bisa diubah hanya PIC di lapangan/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Customer baru/ })).toBeNull();
  });

  it("job baru di edit proyek tetap accordion: header bisa ditutup, bagian pakai tombol Lanjut", () => {
    bungkus(
      <ProyekFormView proyek={PROYEK} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} tambahJob />
    );
    const header = screen.getByRole("button", { name: /Job 2/ });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/isian belum diisi/)).toBeTruthy();
    const unit = screen.getByRole("button", { name: /Assign Unit & Driver/ });
    expect(unit.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Lanjut ke Unit & Driver/ }));
    expect(unit.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("customer terkunci bila proyek sudah masuk tagihan", () => {
    bungkus(
      <ProyekFormView
        proyek={{ ...PROYEK, invoice_id: "i1", invoice_number: "0001/INV/MAS/X/2026" }}
        customers={CUSTOMERS}
        drivers={DRIVERS}
        units={UNITS}
        activeJobs={[]}
      />
    );
    expect(screen.getByText(/Tidak bisa diganti — proyek sudah masuk tagihan 0001\/INV\/MAS\/X\/2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Customer baru/ })).toBeNull();
  });
});

describe("Form edit job", () => {
  it("tidak lagi memuat isian customer & PIC — keduanya milik proyek", () => {
    bungkus(<EditJobView job={JOB} drivers={DRIVERS} units={UNITS} activeJobs={[]} />);
    expect(screen.queryByText(/^PIC di lapangan/)).toBeNull();
    expect(screen.getByText(/ubah di proyek 001\/PRJ\/MAS\/X\/2026/)).toBeTruthy();
  });

  it("uang jalan sudah dicairkan → unit & driver terkunci beserta alasannya", () => {
    bungkus(
      <EditJobView job={{ ...JOB, ada_pencairan_uang_jalan: true }} drivers={DRIVERS} units={UNITS} activeJobs={[]} />
    );
    expect(screen.getAllByText(/Terkunci — uang jalan sudah dicairkan/).length).toBe(2);
  });

  it("belum ada pencairan → unit & driver masih bisa diubah", () => {
    bungkus(<EditJobView job={JOB} drivers={DRIVERS} units={UNITS} activeJobs={[]} />);
    expect(screen.queryByText(/Terkunci — uang jalan sudah dicairkan/)).toBeNull();
  });
});

describe("Tambah job: Duplikat job sebelumnya", () => {
  // Job terakhir proyek (dibuat paling akhir) dengan sales; job dibatalkan yang lebih baru dilewati.
  const TERAKHIR = {
    ...JOB,
    id: "j2",
    job_number: "JOB-002",
    alat_diangkut: "Crane 50 ton",
    asal: "Pelabuhan C",
    tujuan: "Pabrik D",
    asal_lat: -6.1,
    asal_lng: 106.8,
    tujuan_lat: -6.9,
    tujuan_lng: 107.6,
    uang_jalan_awal: 3_000_000,
    sales_id: "s1",
    sales_nama: "Rina Sales",
    sales_no_hp: "081277778888",
    created_at: "2026-09-05T00:00:00Z"
  } as Job;
  const BATAL = { ...JOB, id: "j3", job_number: "JOB-003", status: "cancelled", created_at: "2026-09-09T00:00:00Z" } as Job;

  function tampilTambahJob(jobs: Job[]) {
    bungkus(
      <ProyekFormView
        proyek={{ ...PROYEK, jobs }}
        customers={CUSTOMERS}
        drivers={DRIVERS}
        units={UNITS}
        activeJobs={[]}
        tambahJob
      />
    );
  }

  const alatInputs = () =>
    screen.getAllByPlaceholderText("Contoh: Excavator Komatsu PC200-8") as HTMLInputElement[];

  it("sukses: tombol ada di kartu job baru; diklik → kartu itu terisi dari job terakhir (termasuk sales & No HP sales)", async () => {
    tampilTambahJob([JOB, TERAKHIR, BATAL]);
    expect(screen.getByText("Mirip job sebelumnya?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Duplikat job sebelumnya/ }));
    expect(alatInputs()).toHaveLength(1);
    expect(alatInputs()[0].value).toBe("Crane 50 ton");
    expect(screen.getByDisplayValue("3.000.000")).toBeTruthy();
    expect(screen.getByText("Rina Sales")).toBeTruthy();
    expect(screen.getByDisplayValue("081277778888")).toBeTruthy();
    expect(await screen.findByText("Isian disalin dari JOB-002")).toBeTruthy();
  });

  it("edge: dua kartu job baru → hanya kartu yang tombolnya diklik yang terisi", () => {
    tampilTambahJob([JOB, TERAKHIR]);
    fireEvent.change(alatInputs()[0], { target: { value: "Forklift" } });
    // Kartu baru terbuka (yang lama tertutup — satu kartu terbuka sekaligus).
    fireEvent.click(screen.getByRole("button", { name: /^Tambah job$/ }));
    // Tombol yang terlihat = milik kartu kedua (kartu pertama tertutup).
    fireEvent.click(screen.getByRole("button", { name: /Duplikat job sebelumnya/ }));
    expect(alatInputs().map((i) => i.value)).toEqual(["Forklift", "Crane 50 ton"]);
  });

  it("edge: kartu yang sudah diisi → isian alat ditimpa dari job terakhir", () => {
    tampilTambahJob([JOB, TERAKHIR]);
    fireEvent.change(alatInputs()[0], { target: { value: "Forklift" } });
    fireEvent.click(screen.getByRole("button", { name: /Duplikat job sebelumnya/ }));
    expect(alatInputs()[0].value).toBe("Crane 50 ton");
  });

  it("gagal: semua job proyek dibatalkan → tombol duplikat tidak muncul", () => {
    tampilTambahJob([BATAL]);
    expect(screen.queryByRole("button", { name: /Duplikat job sebelumnya/ })).toBeNull();
  });

  it("edge: halaman edit proyek (bukan tambah job) tidak punya tombol duplikat", () => {
    bungkus(<ProyekFormView proyek={PROYEK} customers={CUSTOMERS} drivers={DRIVERS} units={UNITS} activeJobs={[]} />);
    expect(screen.queryByRole("button", { name: /Duplikat job sebelumnya/ })).toBeNull();
  });
});
