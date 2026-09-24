/**
 * Tambah pengguna: semua karyawan bisa dipilih, tapi karyawan + role yang sama
 * tidak boleh terdaftar dua kali — muncul pesan "data sudah terdaftar".
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { UsersView } from "@/features/settings/components/users-view";
import { AuthProvider } from "@/lib/auth/AuthContext";
import type { JenisUnit, UserRow } from "@/types";

const USERS: UserRow[] = [
  {
    id: "u1",
    email: "rika@mas.co.id",
    nama: "Rika Sari",
    role: "operator",
    roles: ["operator"],
    is_active: true,
    allowed_jenis_unit_ids: ["j1"],
    karyawan_id: "k1",
    created_at: "2026-01-01T00:00:00Z"
  }
];
const JENIS: JenisUnit[] = [{ id: "j1", nama: "Lowbed", is_active: true }];
const KARYAWAN = [
  { id: "k1", nama: "Rika Sari", tanggal_lahir: null, akun: [{ user_id: "u1", role: "operator" }] },
  { id: "k2", nama: "Budi Santoso", tanggal_lahir: null, akun: [] }
];

let posts: { url: string; body: Record<string, unknown> }[];

function renderView(opts: { users?: UserRow[]; currentUserId?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <UsersView users={opts.users ?? USERS} jenisUnit={JENIS} currentUserId={opts.currentUserId ?? "sa"} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  posts = [];
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/users/karyawan-tersedia")) return new Response(JSON.stringify(KARYAWAN));
      if (init?.method === "POST" || init?.method === "PATCH") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ ...USERS[0], id: "u2", role: "superadmin" }), { status: 201 });
      }
      return new Response(JSON.stringify([]));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function bukaTambahDanPilih(nama: string) {
  fireEvent.click(screen.getByRole("button", { name: /Tambah pengguna/ }));
  const form = await screen.findByText("Tambah pengguna", { selector: "h2" });
  const modal = form.closest("div.bg-white") as HTMLElement;
  await waitFor(() => expect(modal.querySelector<HTMLButtonElement>(".combobox-trigger")?.disabled).toBe(false));
  fireEvent.click(modal.querySelector<HTMLButtonElement>(".combobox-trigger")!);
  fireEvent.click(within(screen.getByRole("listbox")).getByText(nama));
  return modal;
}

describe("Tambah pengguna — karyawan + role", () => {
  it("semua karyawan tampil, termasuk yang sudah punya akun (dengan keterangannya)", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Tambah pengguna/ }));
    const modal = (await screen.findByText("Tambah pengguna", { selector: "h2" })).closest("div.bg-white") as HTMLElement;
    await waitFor(() => expect(modal.querySelector<HTMLButtonElement>(".combobox-trigger")?.disabled).toBe(false));
    fireEvent.click(modal.querySelector<HTMLButtonElement>(".combobox-trigger")!);
    const opsi = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(opsi.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Sudah terdaftar: Operator"),
      expect.stringContaining("Budi Santoso")
    ]);
  });

  it("karyawan + role yang sudah terdaftar → pesan data sudah terdaftar, tidak dikirim", async () => {
    renderView();
    const modal = await bukaTambahDanPilih("Rika Sari");
    // Role default Operator — Rika sudah punya akun Operator.
    expect(within(modal).getByText(/Tidak bisa ditambahkan karena data sudah terdaftar/)).toBeTruthy();
    fireEvent.change(modal.querySelectorAll<HTMLInputElement>("input")[0], {
      target: { value: "rika2@mas.co.id" }
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Tambah" }));
    expect(
      await screen.findByText(
        "Pengguna gagal ditambahkan karena data sudah terdaftar: Rika Sari sudah punya akun lain dengan role Operator."
      )
    ).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it("karyawan yang sama dengan role berbeda boleh ditambahkan (akun terpisah)", async () => {
    renderView();
    const modal = await bukaTambahDanPilih("Rika Sari");
    // Role bisa lebih dari satu: centang Super Administrator, lepas Operator.
    fireEvent.click(within(modal).getByRole("button", { name: /Super Administrator/ }));
    expect(within(modal).getByText(/data sudah terdaftar/)).toBeTruthy();
    fireEvent.click(within(modal).getByRole("button", { name: /^Operator/ }));
    expect(within(modal).queryByText(/data sudah terdaftar/)).toBeNull();
    const inputs = modal.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[0], { target: { value: "rika.sa@mas.co.id" } });
    fireEvent.change(inputs[1], { target: { value: "rahasia1" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ karyawan_id: "k1", roles: ["superadmin"], email: "rika.sa@mas.co.id" });
  });
});

describe("Edit pengguna — beberapa role dalam satu akun", () => {
  it("menambah role Super Administrator ke akun Operator yang sama (satu email)", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const modal = (await screen.findByText(/Edit/, { selector: "h2" })).closest("div.bg-white") as HTMLElement;
    await waitFor(() => expect(modal.querySelector<HTMLButtonElement>(".combobox-trigger")?.disabled).toBe(false));
    fireEvent.click(within(modal).getByRole("button", { name: /Super Administrator/ }));
    // Akun Rika sendiri yang punya Operator — bukan duplikat.
    expect(within(modal).queryByText(/data sudah terdaftar/)).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ roles: ["superadmin", "operator"], allowed_jenis_unit_ids: ["j1"] });
  });
});

describe("Edit akun sendiri", () => {
  const SAYA: UserRow = {
    ...USERS[0],
    id: "sa",
    nama: "Budi Santoso",
    karyawan_id: "k2",
    role: "superadmin",
    roles: ["superadmin"],
    allowed_jenis_unit_ids: null
  };

  it("tombol Edit tersedia, reset password & nonaktif tidak; Super Administrator terkunci", async () => {
    renderView({ users: [SAYA], currentUserId: "sa" });
    expect(screen.getByTitle("Edit akun Anda")).toBeTruthy();
    expect(screen.queryByTitle("Reset password")).toBeNull();
    expect(screen.queryByTitle("Nonaktifkan")).toBeNull();
    fireEvent.click(screen.getByTitle("Edit akun Anda"));
    const modal = (await screen.findByText(/Edit/, { selector: "h2" })).closest("div.bg-white") as HTMLElement;
    const tombolSa = within(modal).getByRole("button", { name: /Super Administrator/ }) as HTMLButtonElement;
    expect(tombolSa.disabled).toBe(true);
    // Menambah role Operator ke akun sendiri boleh.
    fireEvent.click(within(modal).getByRole("button", { name: /^Operator/ }));
    fireEvent.click(within(modal).getByLabelText("Lowbed"));
    await waitFor(() => expect(modal.querySelector<HTMLButtonElement>(".combobox-trigger")?.disabled).toBe(false));
    fireEvent.click(within(modal).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts.some((p) => p.url.includes("/users/sa"))).toBe(true));
    const kirim = posts.find((p) => p.url.includes("/users/sa"))!;
    expect(kirim.body).toMatchObject({ roles: ["superadmin", "operator"], allowed_jenis_unit_ids: ["j1"] });
  });
});

describe("Aktifkan pengguna — status karyawan", () => {
  const NONAKTIF: UserRow = { ...USERS[0], is_active: false, karyawan_aktif: false };

  it("karyawan Nonaktif → tidak bisa diaktifkan, tidak ada permintaan ke server", async () => {
    renderView({ users: [NONAKTIF] });
    expect(screen.getByText("Karyawan nonaktif")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Aktifkan"));
    expect(
      await screen.findByText(
        "Pengguna gagal diaktifkan: karyawan Rika Sari berstatus Nonaktif. Aktifkan dulu karyawannya di menu Karyawan."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Aktifkan kembali/)).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("karyawan Aktif → konfirmasi lalu diaktifkan", async () => {
    renderView({ users: [{ ...NONAKTIF, karyawan_aktif: true }] });
    expect(screen.queryByText("Karyawan nonaktif")).toBeNull();
    fireEvent.click(screen.getByTitle("Aktifkan"));
    expect(await screen.findByText(/Aktifkan kembali Rika Sari/)).toBeTruthy();
    // Tombol di dialog (bertulisan), bukan tombol ikon di baris.
    const konfirmasi = screen.getAllByRole("button", { name: "Aktifkan" }).find((b) => b.textContent?.includes("Aktifkan"));
    fireEvent.click(konfirmasi!);
    await waitFor(() => expect(posts.some((p) => p.url.includes("/users/u1/active"))).toBe(true));
    expect(posts.find((p) => p.url.includes("/active"))!.body).toEqual({ is_active: true });
  });
});
