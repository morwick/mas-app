/**
 * Halaman Unit Trailer: daftar dari server (default 10 baris), tambah dengan
 * jenis baru langsung dari form, hapus lewat konfirmasi, dan operator hanya
 * bisa melihat.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { UnitTrailerView } from "@/features/unit-trailer/components/unit-trailer-view";

let superadmin = true;
vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ canManageOperational: superadmin })
}));

const TRAILER = {
  id: "t1",
  kode_trailer: "TR-01",
  tahun: 2020,
  jenis_unit_trailer_id: "j1",
  jenis_nama: "Lowbed",
  jenis_unit_nama: "Lowbed",
  kapasitas_ton: 40,
  status: "standby"
};

type Panggilan = { method: string; url: URL; body: unknown };
let panggilan: Panggilan[];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <UnitTrailerView />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  superadmin = true;
  panggilan = [];
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      panggilan.push({ method, url, body });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (url.pathname.endsWith("/unit-trailer/jenis") && method === "POST")
        return json({ id: "j9", nama: body.nama, jenis_unit_id: body.jenis_unit_id, jenis_unit_nama: "Lowbed" }, 201);
      if (url.pathname.endsWith("/unit-trailer/jenis"))
        return json([{ id: "j1", nama: "Lowbed", jenis_unit_id: "ju1", jenis_unit_nama: "Lowbed" }]);
      if (url.pathname.endsWith("/jenis-unit")) return json([{ id: "ju1", nama: "Lowbed", is_active: true }]);
      if (url.pathname.endsWith("/unit-trailer") && method === "GET")
        return json({ items: [TRAILER], total: 1, page: 1, page_size: 10 });
      if (url.pathname.endsWith("/unit-trailer") && method === "POST") return json({ ...TRAILER, id: "t2" }, 201);
      return json({ ok: true });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const daftar = () => panggilan.filter((p) => p.method === "GET" && p.url.pathname.endsWith("/unit-trailer"));

describe("UnitTrailerView", () => {
  it("menampilkan data dengan default 10 baris per halaman", async () => {
    renderView();
    expect((await screen.findAllByText("TR-01")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("40 ton").length).toBeGreaterThan(0);
    expect(daftar()[0].url.searchParams.get("page_size")).toBe("10");
  });

  it("tambah dengan jenis baru dari dalam form", async () => {
    renderView();
    await screen.findAllByText("TR-01");
    fireEvent.click(screen.getByRole("button", { name: /Tambah unit trailer/ }));

    // Jenis baru: simpan lalu otomatis terpilih.
    fireEvent.click(screen.getByRole("button", { name: /Jenis baru/ }));
    fireEvent.change(screen.getByPlaceholderText("Contoh: Flatbed"), { target: { value: "Flatbed" } });
    // Jenis unit wajib: tanpa memilih, simpan ditolak.
    fireEvent.click(screen.getByRole("button", { name: "Simpan jenis" }));
    expect(await screen.findByText("Jenis unit wajib dipilih")).toBeTruthy();
    expect(panggilan.some((p) => p.method === "POST" && p.url.pathname.endsWith("/unit-trailer/jenis"))).toBe(false);
    // Pilih jenis unit (combobox terakhir yang terbuka = modal Jenis baru).
    const pemicu = document.querySelectorAll<HTMLButtonElement>(".combobox-trigger");
    fireEvent.click(pemicu[pemicu.length - 1]);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Lowbed"));
    fireEvent.click(screen.getByRole("button", { name: "Simpan jenis" }));
    await waitFor(() =>
      expect(panggilan.find((p) => p.method === "POST" && p.url.pathname.endsWith("/unit-trailer/jenis"))?.body).toEqual({
        nama: "Flatbed",
        jenis_unit_id: "ju1"
      })
    );
    // Jenis unit trailer punya tabel sendiri — master Jenis Unit (truk) hanya dibaca, tidak ditambah.
    expect(panggilan.some((p) => p.method === "POST" && p.url.pathname.endsWith("/jenis-unit"))).toBe(false);
    await waitFor(() => expect(screen.queryByPlaceholderText("Contoh: Flatbed")).toBeNull());

    const kode = document.querySelector<HTMLInputElement>("#unit-trailer-form input")!;
    fireEvent.change(kode, { target: { value: "TR-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      const post = panggilan.find((p) => p.method === "POST" && p.url.pathname.endsWith("/unit-trailer"));
      expect(post?.body).toMatchObject({ kode_trailer: "TR-02", jenis_unit_trailer_id: "j9", status: "standby" });
    });
  });

  it("hapus lewat konfirmasi mengirim DELETE (soft delete di server)", async () => {
    renderView();
    await screen.findAllByText("TR-01");
    fireEvent.click(screen.getAllByRole("button", { name: "Hapus TR-01" })[0]);
    const dialog = await screen.findByText(/Hapus unit trailer TR-01\?/);
    fireEvent.click(within(dialog.closest("div.bg-white") as HTMLElement).getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() =>
      expect(panggilan.some((p) => p.method === "DELETE" && p.url.pathname.endsWith("/unit-trailer/t1"))).toBe(true)
    );
  });

  it("operator hanya bisa melihat, tanpa tombol tambah/edit/hapus", async () => {
    superadmin = false;
    renderView();
    await screen.findAllByText("TR-01");
    expect(screen.queryByRole("button", { name: /Tambah unit trailer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hapus TR-01" })).toBeNull();
  });

  it("filter & pencarian dikirim ke server dan kembali ke halaman 1", async () => {
    renderView();
    await screen.findAllByText("TR-01");
    fireEvent.change(screen.getByLabelText("Filter status"), { target: { value: "perbaikan" } });
    await waitFor(() => expect(daftar().at(-1)?.url.searchParams.get("status")).toBe("perbaikan"));
    fireEvent.change(screen.getByPlaceholderText("Cari kode trailer…"), { target: { value: "tr" } });
    await waitFor(() => expect(daftar().at(-1)?.url.searchParams.get("q")).toBe("tr"));
    expect(daftar().at(-1)?.url.searchParams.get("page")).toBe("1");
  });

  it("tahun tidak valid menggagalkan tambah — tidak ada yang dikirim ke server", async () => {
    renderView();
    await screen.findAllByText("TR-01");
    fireEvent.click(screen.getByRole("button", { name: /Tambah unit trailer/ }));
    const input = document.querySelectorAll<HTMLInputElement>("#unit-trailer-form input");
    fireEvent.change(input[0], { target: { value: "TR-03" } });
    // Pilih jenis unit trailer supaya satu-satunya kesalahan adalah tahun.
    const triggers = document.querySelectorAll<HTMLButtonElement>("#unit-trailer-form .combobox-trigger");
    fireEvent.click(triggers[0]);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Lowbed"));
    fireEvent.change(screen.getByPlaceholderText("2020"), { target: { value: "20a0" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect((await screen.findAllByText(/Tahun tidak valid/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Gagal menambah data\. Tahun tidak valid/)).toBeTruthy();
    expect(panggilan.some((p) => p.method === "POST" && p.url.pathname.endsWith("/unit-trailer"))).toBe(false);
  });

  it("filter status bisa menyaring Terjual", async () => {
    renderView();
    await screen.findAllByText("TR-01");
    const opsi = Array.from(screen.getByLabelText("Filter status").querySelectorAll("option")).map((o) => o.textContent);
    expect(opsi).toEqual(["Semua status", "Standby", "Perbaikan", "Terjual"]);
  });
});
