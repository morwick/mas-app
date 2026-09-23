import { describe, expect, it } from "vitest";
import {
  groupHasActive,
  isNavGroup,
  mobileNavItems,
  navItems,
  navTree,
  profileItem,
  visibleNavTree,
  type NavGroup
} from "@/components/layout/nav-items";

function group(key: string): NavGroup {
  const found = navTree.find((e) => isNavGroup(e) && e.key === key);
  if (!found || !isNavGroup(found)) throw new Error(`grup ${key} tidak ada`);
  return found;
}

describe("susunan menu", () => {
  it("urutannya Dashboard, Master, Monitoring, Laporan", () => {
    expect(
      navTree.map((e) => (isNavGroup(e) ? e.label : e.label))
    ).toEqual(["Dashboard", "Master", "Monitoring", "Laporan"]);
  });

  it("Master urut: Pengguna, Jenis Unit, Unit, Driver, Customer", () => {
    expect(group("master").items.map((i) => i.label)).toEqual([
      "Pengguna",
      "Jenis Unit",
      "Unit",
      "Driver",
      "Customer"
    ]);
  });

  it("Jenis Unit tidak lagi bersarang di bawah /settings", () => {
    // Kalau href-nya /settings/..., menu "Pengaturan" ikut tersorot dan ada
    // dua item aktif sekaligus.
    const jenis = group("master").items.find((i) => i.label === "Jenis Unit")!;
    expect(jenis.href).toBe("/jenis-unit");
    expect(jenis.href.startsWith("/settings")).toBe(false);
  });

  it("Monitoring berisi tujuh submenu sesuai urutan", () => {
    expect(group("monitoring").items.map((i) => i.label)).toEqual([
      "Penawaran",
      "Job",
      "Pantau",
      "Uang Jalan",
      "Service",
      "Tagihan",
      "Piutang"
    ]);
  });

  it("Profil di luar pohon — dibuka dari menu profil di top bar", () => {
    const hrefs = navTree.flatMap((e) => (isNavGroup(e) ? e.items : [e])).map((i) => i.href);
    expect(hrefs).not.toContain(profileItem.href);
    // Tapi tetap ada di larik datar, supaya judul halaman ketemu.
    expect(navItems).toContain(profileItem);
  });

  it("tidak ada lagi menu yang mengarah ke /settings", () => {
    for (const item of navItems) expect(item.href.startsWith("/settings")).toBe(false);
  });

  it("Pengguna pindah ke Master dan tetap superadmin-only", () => {
    const pengguna = group("master").items.find((i) => i.label === "Pengguna");
    expect(pengguna?.href).toBe("/pengguna");
    expect(pengguna?.superadminOnly).toBe(true);
  });

  it("tidak ada href ganda", () => {
    const hrefs = navItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("bottom nav tetap merujuk item yang ada", () => {
    for (const item of mobileNavItems) expect(navItems).toContain(item);
  });
});

describe("visibleNavTree", () => {
  it("superadmin melihat semuanya", () => {
    const tree = visibleNavTree(navTree, "superadmin");
    expect(tree.map((e) => e.label)).toEqual([
      "Dashboard",
      "Master",
      "Monitoring",
      "Laporan"
    ]);
  });

  it("operator kehilangan Laporan dan submenu superadmin-only", () => {
    const tree = visibleNavTree(navTree, "operator");
    expect(tree.map((e) => e.label)).toEqual([
      "Dashboard",
      "Master",
      "Monitoring"
    ]);
    const master = tree.find((e) => isNavGroup(e) && e.key === "master");
    // Jenis Unit superadmin-only — operator hanya melihat tiga sisanya.
    expect(master && isNavGroup(master) ? master.items.map((i) => i.label) : []).toEqual([
      "Unit",
      "Driver",
      "Customer"
    ]);
    // Pengguna & Jenis Unit keduanya superadmin-only.
    expect(master && isNavGroup(master) ? master.items.map((i) => i.href) : []).not.toContain("/pengguna");
    const monitoring = tree.find((e) => isNavGroup(e) && e.key === "monitoring");
    expect(monitoring && isNavGroup(monitoring) ? monitoring.items.map((i) => i.label) : []).toEqual([
      "Penawaran",
      "Job",
      "Pantau",
      "Uang Jalan",
      "Tagihan"
    ]);
  });

  it("tidak mengubah pohon aslinya", () => {
    const sebelum = group("monitoring").items.length;
    visibleNavTree(navTree, "operator");
    expect(group("monitoring").items).toHaveLength(sebelum);
  });
});

describe("groupHasActive", () => {
  it("menandai grup yang salah satu submenunya terbuka", () => {
    expect(groupHasActive(group("monitoring"), "/jobs/new")).toBe(true);
    expect(groupHasActive(group("master"), "/drivers")).toBe(true);
  });

  it("tidak menandai grup yang tidak terkait", () => {
    expect(groupHasActive(group("master"), "/jobs")).toBe(false);
    expect(groupHasActive(group("monitoring"), "/units")).toBe(false);
  });
});
