import { describe, expect, it } from "vitest";
import {
  buatGrupApproval,
  groupHasActive,
  isNavGroup,
  mobileNavItems,
  navItems,
  navTree,
  profileItem,
  sisipkanGrupApproval,
  visibleNavTree,
  type NavGroup
} from "@/components/layout/nav-items";

function group(key: string): NavGroup {
  const found = navTree.find((e) => isNavGroup(e) && e.key === key);
  if (!found || !isNavGroup(found)) throw new Error(`grup ${key} tidak ada`);
  return found;
}

describe("susunan menu", () => {
  it("urutannya Dashboard, Master, Monitoring, Laporan, Log Sistem, Notifikasi", () => {
    expect(
      navTree.map((e) => (isNavGroup(e) ? e.label : e.label))
    ).toEqual(["Dashboard", "Master Data", "Monitoring", "Laporan", "Log Sistem", "Notifikasi"]);
  });

  it("Master urut: Karyawan, Pengguna, Approver, Jenis Unit, Unit, Unit Trailer, Driver, Mekanik, Customer, Vendor, Asuransi, Bengkel Luar, Jenis Biaya", () => {
    expect(group("master").items.map((i) => i.label)).toEqual([
      "Karyawan",
      "Pengguna",
      "Approver",
      "Jenis Unit",
      "Unit",
      "Unit Trailer",
      "Driver",
      "Mekanik",
      "Customer",
      "Vendor",
      "Asuransi",
      "Bengkel Luar",
      "Jenis Biaya"
    ]);
  });

  it("Jenis Unit tidak lagi bersarang di bawah /settings", () => {
    // Kalau href-nya /settings/..., menu "Pengaturan" ikut tersorot dan ada
    // dua item aktif sekaligus.
    const jenis = group("master").items.find((i) => i.label === "Jenis Unit")!;
    expect(jenis.href).toBe("/jenis-unit");
    expect(jenis.href.startsWith("/settings")).toBe(false);
  });

  it("Monitoring berisi sepuluh submenu sesuai urutan (Job tepat di bawah Proyek)", () => {
    expect(group("monitoring").items.map((i) => i.label)).toEqual([
      "Penawaran",
      "Proyek",
      "Job",
      "Pantau",
      "Uang Jalan",
      "Service",
      "Tagihan",
      "Piutang",
      "Penjualan Unit & Unit Trailer",
      "Penghapusan Unit & Unit Trailer"
    ]);
  });

  it("Penghapusan Unit & Unit Trailer hanya untuk superadmin", () => {
    const item = group("monitoring").items.find((i) => i.href === "/penghapusan-aset");
    expect(item?.roles).toEqual(["superadmin"]);
  });

  it("Penjualan Unit & Unit Trailer hanya untuk superadmin", () => {
    const item = group("monitoring").items.find((i) => i.href === "/penjualan-unit");
    expect(item?.roles).toEqual(["superadmin"]);
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

  it("Pengguna & Karyawan tetap superadmin-only (admin tidak dapat)", () => {
    const pengguna = group("master").items.find((i) => i.label === "Pengguna");
    expect(pengguna?.href).toBe("/pengguna");
    expect(pengguna?.roles).toEqual(["superadmin"]);
    const karyawan = group("master").items.find((i) => i.label === "Karyawan");
    expect(karyawan?.href).toBe("/karyawan");
    expect(karyawan?.roles).toEqual(["superadmin"]);
  });

  it("Jenis Unit terbuka untuk superadmin & admin", () => {
    const jenis = group("master").items.find((i) => i.label === "Jenis Unit");
    expect(jenis?.roles).toEqual(["superadmin", "admin"]);
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
      "Master Data",
      "Monitoring",
      "Laporan",
      "Log Sistem",
      "Notifikasi"
    ]);
  });

  it("Log Sistem & Tagihan/Piutang untuk superadmin & finance saja", () => {
    const log = navTree.find((e) => !isNavGroup(e) && e.href === "/log-sistem");
    expect(log && !isNavGroup(log) ? log.roles : []).toEqual(["superadmin", "finance"]);
    expect(visibleNavTree(navTree, "finance").map((e) => e.label)).toContain("Log Sistem");
    expect(visibleNavTree(navTree, "operator").map((e) => e.label)).not.toContain("Log Sistem");
    expect(visibleNavTree(navTree, "admin").map((e) => e.label)).not.toContain("Log Sistem");
  });

  it("Laporan terbuka untuk semua role (isi kartunya disaring di halaman)", () => {
    for (const role of ["superadmin", "admin", "operator", "finance"] as const) {
      expect(visibleNavTree(navTree, role).map((e) => e.label)).toContain("Laporan");
    }
  });

  it("operator: Dashboard, Unit/Unit Trailer/Driver, Pantau/Uang Jalan/Service, Laporan, Notifikasi saja", () => {
    const tree = visibleNavTree(navTree, "operator");
    expect(tree.map((e) => e.label)).toEqual([
      "Dashboard",
      "Master Data",
      "Monitoring",
      "Laporan",
      "Notifikasi"
    ]);
    const master = tree.find((e) => isNavGroup(e) && e.key === "master");
    expect(master && isNavGroup(master) ? master.items.map((i) => i.label) : []).toEqual([
      "Unit",
      "Unit Trailer",
      "Driver",
      "Mekanik",
      "Asuransi",
      "Bengkel Luar"
    ]);
    const monitoring = tree.find((e) => isNavGroup(e) && e.key === "monitoring");
    expect(monitoring && isNavGroup(monitoring) ? monitoring.items.map((i) => i.label) : []).toEqual([
      "Pantau",
      "Uang Jalan",
      "Service"
    ]);
  });

  it("admin: master data + operasional penuh (Job, Penawaran, Jenis Unit, Customer), tanpa Tagihan/Piutang/Log Sistem", () => {
    const tree = visibleNavTree(navTree, "admin");
    expect(tree.map((e) => e.label)).toEqual(["Dashboard", "Master Data", "Monitoring", "Laporan", "Notifikasi"]);
    const master = tree.find((e) => isNavGroup(e) && e.key === "master");
    expect(master && isNavGroup(master) ? master.items.map((i) => i.label) : []).toEqual([
      "Jenis Unit",
      "Unit",
      "Unit Trailer",
      "Driver",
      "Mekanik",
      "Customer",
      "Vendor",
      "Asuransi",
      "Bengkel Luar",
      "Jenis Biaya"
    ]);
    const monitoring = tree.find((e) => isNavGroup(e) && e.key === "monitoring");
    expect(monitoring && isNavGroup(monitoring) ? monitoring.items.map((i) => i.label) : []).toEqual([
      "Penawaran",
      "Proyek",
      "Job",
      "Pantau",
      "Uang Jalan",
      "Service"
    ]);
  });

  it("finance: Dashboard, Customer, Vendor, Penawaran (lihat saja), Tagihan/Piutang, Laporan, Log Sistem, Notifikasi saja", () => {
    const tree = visibleNavTree(navTree, "finance");
    expect(tree.map((e) => e.label)).toEqual([
      "Dashboard",
      "Master Data",
      "Monitoring",
      "Laporan",
      "Log Sistem",
      "Notifikasi"
    ]);
    const master = tree.find((e) => isNavGroup(e) && e.key === "master");
    expect(master && isNavGroup(master) ? master.items.map((i) => i.label) : []).toEqual(["Customer", "Vendor"]);
    const monitoring = tree.find((e) => isNavGroup(e) && e.key === "monitoring");
    expect(monitoring && isNavGroup(monitoring) ? monitoring.items.map((i) => i.label) : []).toEqual([
      "Penawaran",
      "Tagihan",
      "Piutang"
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

describe("grup Approval", () => {
  it("tidak ada grup bila pengguna bukan approver", () => {
    expect(buatGrupApproval([])).toBeNull();
    const pohon = visibleNavTree(navTree, "operator");
    expect(sisipkanGrupApproval(pohon, null)).toEqual(pohon);
  });

  it("submenu per fitur dengan angka menunggu, disisipkan setelah Monitoring", () => {
    const grup = buatGrupApproval([
      { kode: "tambahan_uang_jalan", nama: "Tambahan Uang Jalan", menunggu_saya: 2 },
      { kode: "penjualan_aset", nama: "Penjualan Unit & Unit Trailer", menunggu_saya: 0 }
    ]);
    expect(grup?.items.map((i) => [i.href, i.badge])).toEqual([
      ["/approval/tambahan_uang_jalan", 2],
      ["/approval/penjualan_aset", 0]
    ]);
    // Role apa pun (mis. finance) tetap mendapat grup Approval bila ia approver.
    const pohon = sisipkanGrupApproval(visibleNavTree(navTree, "finance"), grup);
    const kunci = pohon.filter(isNavGroup).map((g) => g.key);
    expect(kunci.indexOf("approval")).toBe(kunci.indexOf("monitoring") + 1);
  });

  it("Approver di Master hanya untuk superadmin", () => {
    const item = group("master").items.find((i) => i.href === "/approver");
    expect(item?.roles).toEqual(["superadmin"]);
  });
});
