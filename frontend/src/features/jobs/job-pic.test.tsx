/**
 * PIC lapangan di form job: wajib diisi, terisi otomatis dari master customer
 * saat customer dipilih/diganti, tapi tetap bisa ditimpa manual.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { NewJobView } from "@/features/jobs/components/new-job-view";
import { EditJobView } from "@/features/jobs/components/edit-job-view";
import type { Customer, Driver, Job, Unit } from "@/types";

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
  {
    id: "d1",
    nama: "Agus",
    no_hp: "081200000001",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    status: "stand_by"
  }
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
  alat_diangkut: "Excavator",
  asal: "Gudang A",
  tujuan: "Proyek B",
  unit_id: "u1",
  driver_id: "d1",
  etd: "2026-10-01T01:00:00Z",
  status: "dijadwalkan",
  created_at: "2026-09-01T00:00:00Z",
  eta_is_estimated: false,
  photos: []
} as unknown as Job;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Semua panggilan API digagalkan: test ini hanya soal validasi sisi klien,
  // dan kalau form lolos validasi kita ingin tahu dari fetch yang terpanggil.
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

function renderNew() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <NewJobView
          customers={CUSTOMERS}
          drivers={DRIVERS}
          standbyUnits={UNITS}
          activeJobs={[]}
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

function renderEdit() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <EditJobView
          job={JOB}
          customers={CUSTOMERS}
          drivers={DRIVERS}
          units={UNITS}
          activeJobs={[]}
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

/** Field PIC dicari lewat label — keduanya kini bertanda wajib. */
function picInputs() {
  const nama = screen
    .getByText(/^PIC di lapangan/)
    .closest(".field")!
    .querySelector("input")! as HTMLInputElement;
  const noHp = screen
    .getByText(/^No HP PIC/)
    .closest(".field")!
    .querySelector("input")! as HTMLInputElement;
  return { nama, noHp };
}

/** Buka combobox customer lalu klik salah satu nama perusahaan. */
function pickCustomer(nama: string) {
  const trigger = document.querySelectorAll<HTMLButtonElement>(".combobox-trigger")[0];
  fireEvent.click(trigger);
  const list = screen.getByRole("listbox");
  fireEvent.click(within(list).getByText(nama));
}

function submit() {
  fireEvent.submit(document.querySelector("form")!);
}

function saveButton() {
  return screen.getByRole("button", {
    name: /Simpan job|Simpan perubahan/
  }) as HTMLButtonElement;
}

describe("PIC wajib & auto-isi — form tambah job", () => {
  it("mengisi PIC & no HP dari master saat customer dipilih", () => {
    renderNew();
    expect(picInputs().nama.value).toBe("");

    pickCustomer("PT Anugerah Jaya");
    expect(picInputs().nama.value).toBe("Budi Santoso");
    expect(picInputs().noHp.value).toBe("081211112222");
  });

  it("mengganti isian saat customer diganti", () => {
    renderNew();
    pickCustomer("PT Anugerah Jaya");
    pickCustomer("PT Bumi Sentosa");
    expect(picInputs().nama.value).toBe("Siti Rahma");
    expect(picInputs().noHp.value).toBe("081233334444");
  });

  it("mengosongkan isian bila customer belum punya PIC di master", () => {
    renderNew();
    pickCustomer("PT Anugerah Jaya");
    pickCustomer("CV Karya Mandiri");
    expect(picInputs().nama.value).toBe("");
    expect(picInputs().noHp.value).toBe("");
  });

  it("isian hasil auto-isi tetap bisa diubah manual", () => {
    renderNew();
    pickCustomer("PT Anugerah Jaya");

    fireEvent.change(picInputs().nama, { target: { value: "Pak Joko (mandor)" } });
    fireEvent.change(picInputs().noHp, { target: { value: "081299998888" } });

    expect(picInputs().nama.value).toBe("Pak Joko (mandor)");
    expect(picInputs().noHp.value).toBe("081299998888");
    // Catatan di bawah textbox mempersilakan penyesuaian ke orang di lapangan.
    expect(
      screen.getByText(/Boleh disesuaikan dengan yang standby di lapangan/)
    ).toBeTruthy();
  });

  it("tombol simpan mati selama PIC atau no HP belum diisi", () => {
    renderNew();
    expect(saveButton().disabled).toBe(true);

    // Customer dengan PIC master mengisi keduanya sekaligus.
    pickCustomer("PT Anugerah Jaya");
    fireEvent.change(picInputs().nama, { target: { value: "Budi" } });
    fireEvent.change(picInputs().noHp, { target: { value: "081211112222" } });

    // Kosongkan salah satu → mati lagi.
    fireEvent.change(picInputs().noHp, { target: { value: "" } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(picInputs().noHp, { target: { value: "081211112222" } });
    fireEvent.change(picInputs().nama, { target: { value: "   " } });
    expect(saveButton().disabled).toBe(true);
  });

  it("menolak submit bila PIC kosong", () => {
    renderNew();
    pickCustomer("CV Karya Mandiri");
    submit();

    expect(screen.getByText("PIC wajib diisi")).toBeTruthy();
    expect(screen.getByText("No HP PIC wajib diisi")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("menolak no HP PIC dengan format salah", () => {
    renderNew();
    pickCustomer("PT Anugerah Jaya");
    fireEvent.change(picInputs().noHp, { target: { value: "12345" } });
    submit();

    expect(screen.getByText(/Format: 08xxxxxxxxxx/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("membersihkan pesan error lama setelah customer diganti", () => {
    renderNew();
    pickCustomer("CV Karya Mandiri");
    submit();
    expect(screen.getByText("PIC wajib diisi")).toBeTruthy();

    pickCustomer("PT Anugerah Jaya");
    expect(screen.queryByText("PIC wajib diisi")).toBeNull();
    expect(screen.queryByText("No HP PIC wajib diisi")).toBeNull();
  });
});

describe("Tambah customer inline — PIC & no telepon wajib", () => {
  function openModal() {
    fireEvent.click(screen.getByRole("button", { name: /Customer baru/ }));
  }

  function modalFields() {
    const byLabel = (re: RegExp) =>
      screen.getByText(re).closest(".field")!.querySelector("input")! as HTMLInputElement;
    return {
      nama: byLabel(/^Nama perusahaan/),
      pic: byLabel(/^PIC$/),
      noHp: byLabel(/^No telepon PIC/)
    };
  }

  function simpanDanPilih() {
    fireEvent.click(screen.getByRole("button", { name: /Simpan & pilih/ }));
  }

  /** NewJobView juga memanggil fetch saat mount (posisi GPS), jadi yang
      dihitung khusus request pembuatan customer. */
  function customerPosts() {
    return fetchMock.mock.calls.filter(([input, init]) => {
      const url = String(input);
      return url.includes("/customers") && (init as RequestInit)?.method === "POST";
    });
  }

  it("menolak simpan bila PIC atau no telepon kosong", async () => {
    renderNew();
    openModal();
    fireEvent.change(modalFields().nama, { target: { value: "PT Baru Jaya" } });
    simpanDanPilih();

    expect(await screen.findByText("PIC wajib diisi")).toBeTruthy();
    expect(screen.getByText("No telepon PIC wajib diisi")).toBeTruthy();
    expect(customerPosts()).toHaveLength(0);
  });

  it("menolak format no telepon yang salah", async () => {
    renderNew();
    openModal();
    fireEvent.change(modalFields().nama, { target: { value: "PT Baru Jaya" } });
    fireEvent.change(modalFields().pic, { target: { value: "Rudi" } });
    fireEvent.change(modalFields().noHp, { target: { value: "12345" } });
    simpanDanPilih();

    expect(await screen.findByText(/Format: 08xxxxxxxxxx/)).toBeTruthy();
    expect(customerPosts()).toHaveLength(0);
  });

  it("mengisi PIC job dari customer yang baru dibuat", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ id: "cbaru", nama_perusahaan: "PT Baru Jaya" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    renderNew();
    openModal();
    fireEvent.change(modalFields().nama, { target: { value: "PT Baru Jaya" } });
    fireEvent.change(modalFields().pic, { target: { value: "Rudi Hartono" } });
    fireEvent.change(modalFields().noHp, { target: { value: "081255556666" } });
    simpanDanPilih();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(picInputs().nama.value).toBe("Rudi Hartono"));
    expect(picInputs().noHp.value).toBe("081255556666");
    expect(customerPosts()).toHaveLength(1);
  });

  it("mempertahankan isian bila simpan gagal", async () => {
    // fetchMock default membalas 500.
    renderNew();
    openModal();
    fireEvent.change(modalFields().nama, { target: { value: "PT Baru Jaya" } });
    fireEvent.change(modalFields().pic, { target: { value: "Rudi Hartono" } });
    fireEvent.change(modalFields().noHp, { target: { value: "081255556666" } });
    simpanDanPilih();

    await waitFor(() => expect(customerPosts()).toHaveLength(1));
    expect(modalFields().pic.value).toBe("Rudi Hartono");
    expect(modalFields().nama.value).toBe("PT Baru Jaya");
    expect(modalFields().noHp.value).toBe("081255556666");
  });
});

describe("PIC wajib & auto-isi — form edit job", () => {
  it("memuat PIC yang tersimpan di job, bukan dari master", () => {
    renderEdit();
    expect(picInputs().nama.value).toBe("Budi Santoso");
    expect(picInputs().noHp.value).toBe("081211112222");
  });

  it("mengganti PIC saat customer job diubah", () => {
    renderEdit();
    pickCustomer("PT Bumi Sentosa");
    expect(picInputs().nama.value).toBe("Siti Rahma");
    expect(picInputs().noHp.value).toBe("081233334444");
  });

  it("tombol simpan mati saat PIC dikosongkan, hidup lagi saat diisi", () => {
    renderEdit();
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(picInputs().noHp, { target: { value: "" } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(picInputs().noHp, { target: { value: "081211112222" } });
    expect(saveButton().disabled).toBe(false);
  });

  it("menolak submit bila PIC dikosongkan", () => {
    renderEdit();
    fireEvent.change(picInputs().nama, { target: { value: "  " } });
    fireEvent.change(picInputs().noHp, { target: { value: "" } });
    submit();

    expect(screen.getByText("PIC wajib diisi")).toBeTruthy();
    expect(screen.getByText("No HP PIC wajib diisi")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
