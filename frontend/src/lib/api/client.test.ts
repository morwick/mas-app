/**
 * Server tidak terjangkau: pesan gagal sesuai jenis aksi, bukan "Failed to fetch".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, toResult } from "@/lib/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function serverMati() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
}

describe("request saat server tidak terjangkau", () => {
  it("tambah data → Gagal menambah data", async () => {
    serverMati();
    const res = await toResult(api.post("/customers", { nama_perusahaan: "PT X" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Gagal menambah data\. Tidak bisa terhubung ke server/);
  });

  it("ubah data & aksi ubah status → Gagal mengubah data", async () => {
    serverMati();
    const a = await toResult(api.patch("/customers/1", {}));
    const b = await toResult(api.post("/jobs/1/status", {}));
    if (!a.ok) expect(a.error).toMatch(/^Gagal mengubah data\./);
    if (!b.ok) expect(b.error).toMatch(/^Gagal mengubah data\./);
  });

  it("hapus data → Gagal menghapus data", async () => {
    serverMati();
    const res = await toResult(api.delete("/jenis-unit/1"));
    if (!res.ok) expect(res.error).toMatch(/^Gagal menghapus data\./);
  });

  it("baca data tanpa awalan gagal", async () => {
    serverMati();
    const res = await toResult(api.get("/customers"));
    if (!res.ok) expect(res.error).toMatch(/^Tidak bisa terhubung ke server/);
  });
});
