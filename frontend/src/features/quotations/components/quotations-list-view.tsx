import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, FileText, Handshake, Hourglass, Plus, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import { QuotationStatusBadge } from "./quotation-status-badge";
import type { Customer, QuotationListRow, QuotationStatus } from "@/types";
import { formatDate, formatRupiah, hariIniWIB, tambahHari } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/features/dashboard/components/stat-card";

interface Props {
  quotations: QuotationListRow[];
  customers: Customer[];
  /** Datang dari query string (mis. diklik dari kolom "Jumlah penawaran" di menu Customer). */
  initialCustomerId?: string;
  /** Filter awal dari URL (`?filter=`), mis. dari kartu "Perlu tindakan" dashboard. */
  initialFilter?: string;
  /** Finance: hanya melihat — tanpa tombol buat penawaran. */
  hanyaLihat?: boolean;
}

// Status surat hanya draft / terkirim / completed / kedaluwarsa. Deal &
// ditolak adalah keputusan per ITEM, jadi chip Deal / Ditolak menyaring surat
// yang punya minimal satu item deal / ditolak ("ada_item_deal" /
// "ada_item_ditolak"). "deal_pending" = masih ada item deal tanpa job —
// daftar kerja admin.
// Dari kartu monitoring: "ada_item_deal" = punya item disetujui (status
// penawarannya bisa masih terkirim bila item lain belum diputuskan);
// "tidak_deal" = ditolak + kedaluwarsa; "ada_item_menunggu" = terkirim & masih
// ada item yang belum diputuskan customer (peluang yang akan datang).
type FilterKey =
  | "all"
  | QuotationStatus
  | "deal_pending"
  | "akan_kedaluwarsa"
  | "ada_item_deal"
  | "ada_item_ditolak"
  | "ada_item_menunggu"
  | "tidak_deal";

/** Terkirim & masa berlakunya habis dalam sekian hari (sama dengan dashboard). */
const AKAN_KEDALUWARSA_HARI = 7;


function akanKedaluwarsa(row: QuotationListRow, hariIni: string, batas: string): boolean {
  if (row.status !== "terkirim" || !row.berlaku_sampai) return false;
  const t = row.berlaku_sampai.slice(0, 10);
  return t >= hariIni && t <= batas;
}

/** Masih punya item deal yang belum dibuatkan job (apa pun status suratnya). */
function dealBelumJob(row: QuotationListRow): boolean {
  return (row.jumlah_item_deal_belum_job ?? 0) > 0;
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/** Penawaran di periode terpilih: tahun "" = semua tahun, bulan "" = setahun penuh. */
function dalamPeriode(row: QuotationListRow, tahun: string, bulan: string): boolean {
  if (!tahun) return true;
  const t = row.tanggal.slice(0, 10);
  if (!t.startsWith(`${tahun}-`)) return false;
  return !bulan || t.slice(5, 7) === bulan;
}

/**
 * Nilai item sebelum PPN → nilai seperti di tabel: + PPN hanya bila surat itu
 * memakai PPN, dengan tarif & pembulatan yang sama dengan database
 * (ROUND(subtotal × persen / 100)).
 */
function denganPpn(row: QuotationListRow, nilai: number): number {
  return row.ppn_aktif ? nilai + Math.round((nilai * Number(row.ppn_persen)) / 100) : nilai;
}

/** Item yang masih menunggu keputusan customer di penawaran terkirim (belum
 *  kedaluwarsa) — peluang nominal yang akan datang. Draft belum ditawarkan. */
function itemMenunggu(row: QuotationListRow): { item: number; nilai: number } {
  if (row.status !== "terkirim") return { item: 0, nilai: 0 };
  return { item: row.jumlah_item_menunggu ?? 0, nilai: row.nilai_item_menunggu ?? 0 };
}

/** Item ditolak, ditambah item yang belum diputuskan saat penawarannya kedaluwarsa. */
function itemTidakDeal(row: QuotationListRow): { item: number; nilai: number } {
  const lewat = row.status === "kedaluwarsa";
  return {
    item: (row.jumlah_item_ditolak ?? 0) + (lewat ? row.jumlah_item_menunggu ?? 0 : 0),
    nilai: (row.nilai_item_ditolak ?? 0) + (lewat ? row.nilai_item_menunggu ?? 0 : 0)
  };
}

const FILTER_URL: FilterKey[] = [
  "all", "draft", "terkirim", "ada_item_deal", "deal_pending", "akan_kedaluwarsa", "ada_item_ditolak", "kedaluwarsa"
];
/** Alamat lama (?filter=deal / ditolak — dulu status surat) → filter per item. */
const FILTER_LAMA: Record<string, FilterKey> = { deal: "ada_item_deal", ditolak: "ada_item_ditolak" };

interface Pelaksanaan {
  label: string;
  tone: "belum" | "jalan" | "selesai" | "netral";
}

/**
 * Ringkas kemajuan pelaksanaan sebuah penawaran.
 *
 * Hanya relevan untuk penawaran yang sudah deal — sebelum itu memang belum
 * boleh ada job, jadi menampilkan "belum ada job" justru menyesatkan.
 */
function pelaksanaan(row: QuotationListRow): Pelaksanaan {
  if (!(row.jumlah_item_deal ?? 0)) return { label: "—", tone: "netral" };
  if (row.jumlah_job === 0) return { label: "Belum ada job", tone: "belum" };

  const { jumlah_job, jumlah_job_selesai, jumlah_item } = row;
  // Tuntas hanya kalau setiap rute sudah punya job DAN semuanya selesai.
  // Tanpa syarat pertama, penawaran 3 rute yang baru dijalankan 1 rute akan
  // terlihat selesai begitu job tunggal itu rampung.
  if (jumlah_job_selesai === jumlah_job && jumlah_job >= jumlah_item)
    return { label: "Selesai", tone: "selesai" };

  return {
    label: `${jumlah_job_selesai} dari ${jumlah_job} job selesai`,
    tone: "jalan"
  };
}

interface BagianItem {
  teks: string;
  warna: string;
}

const WARNA_ITEM = {
  tindakan: "var(--status-pickup-text)",
  deal: "var(--status-standby-text)",
  ditolak: "var(--status-cancelled-text)",
  netral: "var(--text-tertiary)"
};

/**
 * Ringkasan item di bawah nama customer — apa yang perlu dilakukan / hasilnya:
 * draft → "3 item perlu dikirim"; terkirim → "3 item perlu follow up";
 * sudah ada keputusan → "2 deal · 1 ditolak" (+ sisa yang masih menunggu).
 */
export function ringkasanItem(row: QuotationListRow): BagianItem[] {
  if (row.status === "draft") {
    return [{ teks: `${row.jumlah_item} item perlu dikirim`, warna: WARNA_ITEM.tindakan }];
  }
  const deal = row.jumlah_item_deal ?? 0;
  const ditolak = row.jumlah_item_ditolak ?? 0;
  const menunggu = row.jumlah_item_menunggu ?? 0;
  const lewat = row.status === "kedaluwarsa";
  if (deal === 0 && ditolak === 0) {
    return [
      lewat
        ? { teks: `${menunggu} item kedaluwarsa`, warna: WARNA_ITEM.netral }
        : { teks: `${menunggu} item perlu follow up`, warna: WARNA_ITEM.tindakan }
    ];
  }
  const out: BagianItem[] = [];
  if (deal) out.push({ teks: `${deal} deal`, warna: WARNA_ITEM.deal });
  if (ditolak) out.push({ teks: `${ditolak} ditolak`, warna: WARNA_ITEM.ditolak });
  if (menunggu) {
    out.push(
      lewat
        ? { teks: `${menunggu} kedaluwarsa`, warna: WARNA_ITEM.netral }
        : { teks: `${menunggu} perlu follow up`, warna: WARNA_ITEM.tindakan }
    );
  }
  return out;
}

function RingkasanItem({ row }: { row: QuotationListRow }) {
  const bagian = ringkasanItem(row);
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {bagian.map((b, i) => (
        <span key={b.teks}>
          {i > 0 && <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · </span>}
          <span style={{ color: b.warna }}>{b.teks}</span>
        </span>
      ))}
    </div>
  );
}

const toneColor: Record<Pelaksanaan["tone"], string> = {
  belum: "var(--text-primary)",
  jalan: "var(--text-secondary)",
  selesai: "var(--brand-primary-dark)",
  netral: "var(--text-tertiary)"
};

export function QuotationsListView({
  quotations,
  customers,
  initialCustomerId,
  initialFilter,
  hanyaLihat = false
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>(
    FILTER_LAMA[initialFilter ?? ""] ??
      (FILTER_URL.includes(initialFilter as FilterKey) ? (initialFilter as FilterKey) : "all")
  );
  const { hariIni, batasKedaluwarsa } = useMemo(() => {
    const hariIni = hariIniWIB();
    return { hariIni, batasKedaluwarsa: tambahHari(hariIni, AKAN_KEDALUWARSA_HARI) };
  }, []);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  // Periode: default bulan ini (WIB). Datang dari tautan (customer / kartu
  // dashboard) → semua periode, supaya angkanya sama dengan tempat asalnya.
  const dariTautan = Boolean(initialCustomerId || initialFilter);
  const [tahun, setTahun] = useState(dariTautan ? "" : hariIni.slice(0, 4));
  const [bulan, setBulan] = useState(dariTautan ? "" : hariIni.slice(5, 7));
  const pilihanTahun = useMemo(() => {
    const set = new Set(quotations.map((r) => r.tanggal.slice(0, 4)));
    set.add(hariIni.slice(0, 4));
    return [...set].sort().reverse();
  }, [quotations, hariIni]);

  // Baris di periode & customer terpilih — dasar kartu monitoring, hitungan
  // chip status, dan tabel.
  const periode = useMemo(
    () =>
      quotations.filter(
        (row) => dalamPeriode(row, tahun, bulan) && (!customerId || row.customer_id === customerId)
      ),
    [quotations, tahun, bulan, customerId]
  );

  // Menyesuaikan saat halaman dibuka lagi lewat tautan customer lain
  // (mis. dari kolom "Jumlah penawaran" di menu Customer) tanpa remount komponen.
  useEffect(() => {
    setCustomerId(initialCustomerId ?? "");
  }, [initialCustomerId]);

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      customers
        .filter((c) => c.is_active)
        .map((c) => ({
          value: c.id,
          label: c.nama_perusahaan,
          hint: c.kota ?? undefined
        })),
    [customers]
  );

  // Dihitung dari baris yang sudah dipetakan, bukan lewat query terpisah —
  // status kedaluwarsa diturunkan saat baca, jadi COUNT di database akan
  // memberi angka yang berbeda dari yang tampil.
  const counts = useMemo(() => {
    const c: Record<QuotationStatus, number> = {
      draft: 0,
      terkirim: 0,
      completed: 0,
      kedaluwarsa: 0
    };
    for (const row of periode) c[row.status] += 1;
    // Deal / ditolak per item: jumlah surat yang punya minimal satu item itu.
    return {
      ...c,
      adaItemDeal: periode.filter((r) => (r.jumlah_item_deal ?? 0) > 0).length,
      adaItemDitolak: periode.filter((r) => (r.jumlah_item_ditolak ?? 0) > 0).length
    };
  }, [periode]);

  // Kartu monitoring: jumlah surat (penawaran) & item (baris rincian).
  // Nilai dihitung seperti kolom Nilai di tabel: + PPN bila suratnya ber-PPN.
  // Item deal memakai harga revisi bila ada.
  const monitor = useMemo(() => {
    const ringkas = (per: (r: QuotationListRow) => { item: number; nilai: number }) => {
      let item = 0;
      let nilai = 0;
      let surat = 0;
      for (const row of periode) {
        const x = per(row);
        if (x.item > 0) surat += 1;
        item += x.item;
        nilai += denganPpn(row, x.nilai);
      }
      return { item, nilai, surat };
    };
    return {
      // subtotal + PPN surat = kolom Nilai di tabel.
      total: ringkas((r) => ({ item: r.jumlah_item, nilai: r.subtotal })),
      deal: {
        ...ringkas((r) => ({ item: r.jumlah_item_deal ?? 0, nilai: r.nilai_deal })),
        revisi: periode.reduce((sum, r) => sum + (r.jumlah_item_deal_revisi ?? 0), 0)
      },
      menunggu: ringkas(itemMenunggu),
      // Draft belum ditawarkan — ditampilkan terpisah sebagai peluang tambahan.
      draft: ringkas((r) => (r.status === "draft" ? { item: r.jumlah_item, nilai: r.subtotal } : { item: 0, nilai: 0 })),
      tidakDeal: ringkas(itemTidakDeal)
    };
  }, [periode]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return periode.filter((row) => {
      if (filter === "deal_pending") {
        if (!dealBelumJob(row)) return false;
      } else if (filter === "akan_kedaluwarsa") {
        if (!akanKedaluwarsa(row, hariIni, batasKedaluwarsa)) return false;
      } else if (filter === "ada_item_deal") {
        if (!(row.jumlah_item_deal ?? 0)) return false;
      } else if (filter === "ada_item_ditolak") {
        if (!(row.jumlah_item_ditolak ?? 0)) return false;
      } else if (filter === "ada_item_menunggu") {
        if (itemMenunggu(row).item === 0) return false;
      } else if (filter === "tidak_deal") {
        if (itemTidakDeal(row).item === 0) return false;
      } else if (filter !== "all" && row.status !== filter) {
        return false;
      }
      if (!needle) return true;
      return (
        row.quote_number.toLowerCase().includes(needle) ||
        row.customer_nama.toLowerCase().includes(needle) ||
        (row.objek ?? "").toLowerCase().includes(needle) ||
        (row.pic_nama ?? "").toLowerCase().includes(needle)
      );
    });
  }, [periode, q, filter, hariIni, batasKedaluwarsa]);

  const totalNilai = useMemo(
    () => filtered.reduce((sum, r) => sum + r.total, 0),
    [filtered]
  );

  const dealBelumJalan = useMemo(() => periode.filter(dealBelumJob).length, [periode]);
  const jumlahAkanKedaluwarsa = useMemo(
    () => periode.filter((r) => akanKedaluwarsa(r, hariIni, batasKedaluwarsa)).length,
    [periode, hariIni, batasKedaluwarsa]
  );

  const pg = usePagination(filtered, { resetKey: `${q}|${filter}|${customerId}|${tahun}|${bulan}` });
  const labelPeriode = !tahun ? "semua periode" : bulan ? `${NAMA_BULAN[Number(bulan) - 1]} ${tahun}` : `tahun ${tahun}`;
  const pilihChip = (k: FilterKey) => setFilter((f) => (f === k ? "all" : k));

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <PageHeader
        title="Penawaran"
        description="Surat penawaran harga ke customer beserta statusnya."
      />
      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor surat, customer, atau alat…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="toolbar-filter">
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder="Semua customer"
            searchPlaceholder="Cari customer…"
            emptyText="Customer tidak ditemukan"
            clearable
          />
        </div>
        <div className="toolbar-filter">
          <Select value={bulan} onChange={(e) => setBulan(e.target.value)} disabled={!tahun} aria-label="Filter bulan">
            <option value="">Semua bulan</option>
            {NAMA_BULAN.map((nama, i) => (
              <option key={nama} value={String(i + 1).padStart(2, "0")}>
                {nama}
              </option>
            ))}
          </Select>
        </div>
        <div className="toolbar-filter">
          <Select
            value={tahun}
            onChange={(e) => {
              setTahun(e.target.value);
              if (!e.target.value) setBulan("");
            }}
            aria-label="Filter tahun"
          >
            <option value="">Semua tahun</option>
            {pilihanTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        {!hanyaLihat && (
          <Link to="/quotations/new" className="hidden lg:inline-flex">
            <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
              Buat penawaran
            </Button>
          </Link>
        )}
      </div>

      {/* Kartu monitoring — mengikuti periode & customer terpilih. Klik kartu
          = saring tabel ke status itu (klik lagi untuk melepas). */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <div className="stat-grid">
          <StatCard
            label={`Total penawaran · ${labelPeriode}`}
            value={`${periode.length} surat`}
            sublabel={`${monitor.total.item} item · ${formatRupiah(monitor.total.nilai)}`}
            icon={FileText}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatCard
            label="Menunggu keputusan"
            value={`${monitor.menunggu.item} item`}
            sublabel={[
              formatRupiah(monitor.menunggu.nilai),
              monitor.draft.item > 0 ? `+ ${formatRupiah(monitor.draft.nilai)} di draft` : null
            ]
              .filter(Boolean)
              .join(" · ")}
            icon={Hourglass}
            tone="bertugas"
            active={filter === "ada_item_menunggu"}
            onClick={() => pilihChip("ada_item_menunggu")}
          />
          <StatCard
            label="Deal (disetujui)"
            value={`${monitor.deal.item} item`}
            sublabel={[
              formatRupiah(monitor.deal.nilai),
              monitor.deal.revisi > 0 ? `${monitor.deal.revisi} harga direvisi` : null
            ]
              .filter(Boolean)
              .join(" · ")}
            icon={Handshake}
            tone="unitStandby"
            active={filter === "ada_item_deal"}
            onClick={() => pilihChip("ada_item_deal")}
          />
          <StatCard
            label="Ditolak / kedaluwarsa"
            value={`${monitor.tidakDeal.item} item`}
            sublabel={formatRupiah(monitor.tidakDeal.nilai)}
            icon={XCircle}
            active={filter === "tidak_deal"}
            onClick={() => pilihChip("tidak_deal")}
          />
        </div>
        <p className="caption">
          1 surat penawaran bisa berisi beberapa item (rute). Nilai dihitung seperti kolom Nilai di tabel: sudah
          termasuk PPN bila suratnya memakai PPN. Item deal memakai harga setelah revisi. Menunggu keputusan =
          item di penawaran terkirim yang belum dijawab customer; nilai draft (belum dikirim) ditampilkan terpisah.
          Klik kartu untuk menyaring tabel.
        </p>
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
        items={[
          { key: "all", label: "Semua", count: periode.length },
          { key: "draft", label: "Draft", count: counts.draft },
          // Terkirim = belum dijawab customer → daftar kerja admin untuk follow up.
          { key: "terkirim", label: "Terkirim (Butuh Follow up)", count: counts.terkirim },
          // Deal / Ditolak = keputusan per item (surat yang punya item itu).
          { key: "ada_item_deal", label: "Deal", count: counts.adaItemDeal },
          {
            key: "deal_pending",
            label: "Deal — belum ada job",
            count: dealBelumJalan
          },
          {
            key: "akan_kedaluwarsa",
            label: "Akan kedaluwarsa",
            count: jumlahAkanKedaluwarsa
          },
          { key: "ada_item_ditolak", label: "Ditolak", count: counts.adaItemDitolak },
          {
            key: "kedaluwarsa",
            label: "Kedaluwarsa",
            count: counts.kedaluwarsa
          }
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            quotations.length === 0
              ? "Belum ada penawaran"
              : "Tidak ada yang cocok"
          }
          description={
            quotations.length === 0
              ? "Buat surat penawaran pertama — nomor surat diisi otomatis."
              : "Coba ubah periode, kata kunci, atau filter statusnya."
          }
          action={
            quotations.length === 0 && !hanyaLihat ? (
              <Link to="/quotations/new">
                <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                  Buat penawaran
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="card hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Nomor surat</th>
                  <th>Customer</th>
                  <th style={{ width: 110 }}>Tanggal</th>
                  <th style={{ width: 110 }}>Berlaku s.d.</th>
                  <th style={{ width: 150, textAlign: "right" }}>Nilai</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 170 }}>Pelaksanaan</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {pg.items.map((row) => (
                  <tr key={row.id} className="row-link">
                    <td>
                      <Link
                        to={`/quotations/${row.id}`}
                        className="mono"
                        style={{
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {row.quote_number}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }} title={row.objek ?? undefined}>
                        {row.customer_nama}
                      </div>
                      <RingkasanItem row={row} />
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {formatDate(row.tanggal)}
                    </td>
                    <td
                      style={{
                        fontSize: 12.5,
                        color: row.status === "kedaluwarsa" ? "#C13838" : "var(--text-secondary)",
                        fontWeight: row.status === "kedaluwarsa" ? 600 : 400
                      }}
                    >
                      {row.berlaku_sampai ? formatDate(row.berlaku_sampai) : "—"}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}
                    >
                      {formatRupiah(row.total)}
                    </td>
                    <td>
                      <QuotationStatusBadge status={row.status} />
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {(() => {
                        const p = pelaksanaan(row);
                        return (
                          <span
                            style={{
                              color: toneColor[p.tone],
                              fontWeight: p.tone === "belum" ? 600 : 400,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5
                            }}
                          >
                            {p.tone === "selesai" && (
                              <CheckCircle2 style={{ width: 13, height: 13 }} />
                            )}
                            {p.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <Link
                        to={`/quotations/${row.id}`}
                        style={{
                          color: "var(--text-tertiary)",
                          display: "inline-flex"
                        }}
                      >
                        <ChevronRight style={{ width: 16, height: 16 }} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {filtered.length} penawaran ditampilkan
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}
                  >
                    {formatRupiah(totalNilai)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((row) => (
              <Link
                key={row.id}
                to={`/quotations/${row.id}`}
                className="list-card"
              >
                <div className="list-card-row">
                  <span
                    className="mono"
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {row.quote_number}
                  </span>
                  <QuotationStatusBadge status={row.status} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, paddingTop: 2 }}>
                  {row.customer_nama}
                </div>
                <RingkasanItem row={row} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 6,
                    fontSize: 12.5
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(row.tanggal)}
                    {row.berlaku_sampai && (
                      <>
                        {" · s.d. "}
                        <span
                          style={{
                            color: row.status === "kedaluwarsa" ? "#C13838" : "var(--text-tertiary)",
                            fontWeight: row.status === "kedaluwarsa" ? 600 : 400
                          }}
                        >
                          {formatDate(row.berlaku_sampai)}
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    className="mono"
                    style={{ fontWeight: 700, color: "var(--text-primary)" }}
                  >
                    {formatRupiah(row.total)}
                  </span>
                </div>
                {(row.jumlah_item_deal ?? 0) > 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      paddingTop: 4,
                      borderTop: "1px solid var(--border-default)",
                      marginTop: 4,
                      color: toneColor[pelaksanaan(row).tone],
                      fontWeight: pelaksanaan(row).tone === "belum" ? 600 : 400
                    }}
                  >
                    {pelaksanaan(row).label}
                  </div>
                )}
              </Link>
            ))}
          </div>

          <Pagination state={pg} label="penawaran" />
        </>
      )}

      {!hanyaLihat && <Fab href="/quotations/new" label="Buat penawaran" />}
    </div>
  );
}
