import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileCheck2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Pagination, usePagination } from "@/components/ui/pagination";
import type { Customer, JobBelumDitagihRow } from "@/types";

interface Props {
  /** Job siap ditagih per customer (backend sudah menyaring: semua job proyeknya selesai). */
  jobsPerCustomer: Record<string, JobBelumDitagihRow[]>;
  customers: Customer[];
}

/** Satu baris = satu proyek beserta job-job yang siap ditagih. */
export interface ProyekSiapTagih {
  key: string;
  proyekId: string | null;
  proyekNomor: string;
  customerId: string;
  customerNama: string;
  /** Alat yang diangkut, unik, digabung koma. */
  alat: string;
  /** Jumlah job proyek yang tidak dibatalkan. */
  jumlahJob: number;
  jobIds: string[];
  /** Tagihan aktif yang sudah memuat job lain dari proyek ini. */
  invoiceNumber: string | null;
  /** Untuk urutan: job paling lama selesai. */
  selesaiPertama: string;
}

/** Kelompokkan job siap tagih per proyek; yang paling lama menunggu di atas. */
export function kelompokkanPerProyek(
  jobsPerCustomer: Record<string, JobBelumDitagihRow[]>,
  namaCustomer: Record<string, string>
): ProyekSiapTagih[] {
  const map = new Map<string, ProyekSiapTagih>();
  for (const [cid, jobs] of Object.entries(jobsPerCustomer)) {
    for (const job of jobs) {
      // Job tanpa proyek (seharusnya tidak ada) tetap tampil sebagai baris sendiri.
      const key = job.proyek_id ?? `job:${job.id}`;
      const selesai = job.completed_at ?? job.etd;
      const ada = map.get(key);
      if (ada) {
        ada.jobIds.push(job.id);
        if (!ada.alat.split(", ").includes(job.alat_diangkut)) ada.alat += `, ${job.alat_diangkut}`;
        if (selesai < ada.selesaiPertama) ada.selesaiPertama = selesai;
        continue;
      }
      map.set(key, {
        key,
        proyekId: job.proyek_id ?? null,
        proyekNomor: job.proyek_nomor ?? job.job_number,
        customerId: cid,
        customerNama: namaCustomer[cid] ?? "Customer tidak dikenal",
        alat: job.alat_diangkut,
        jumlahJob: job.proyek_jumlah_job ?? 1,
        jobIds: [job.id],
        invoiceNumber: job.proyek_invoice_number ?? null,
        selesaiPertama: selesai
      });
    }
  }
  return [...map.values()].sort((a, b) => a.selesaiPertama.localeCompare(b.selesaiPertama));
}

/** Nomor proyek sebagai tautan ke detail proyek (tab baru). */
function TautanProyek({ row }: { row: ProyekSiapTagih }) {
  if (!row.proyekId) return <>{row.proyekNomor}</>;
  return (
    <Link
      to={`/proyek/${row.proyekId}`}
      target="_blank"
      rel="noreferrer"
      title="Buka detail proyek di tab baru"
      onClick={(e) => e.stopPropagation()}
      style={{ color: "var(--brand-primary-dark)", textDecoration: "underline" }}
    >
      {row.proyekNomor}
    </Link>
  );
}

/**
 * Tab "Proyek siap ditagih": proyek yang semua job-nya (selain yang batal)
 * sudah selesai & belum ditagih. Proyek dicentang lalu digabung jadi satu
 * tagihan. Satu tagihan hanya boleh berisi proyek dari satu customer yang
 * sama — begitu ada yang tercentang, proyek customer lain dikunci.
 */
export function ProyekSiapTagihView({ jobsPerCustomer, customers }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const namaCustomer = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c.nama_perusahaan])),
    [customers]
  );

  const rows = useMemo(() => kelompokkanPerProyek(jobsPerCustomer, namaCustomer), [jobsPerCustomer, namaCustomer]);

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      Object.keys(jobsPerCustomer)
        .map((cid) => ({ value: cid, label: namaCustomer[cid] ?? "Customer tidak dikenal" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [jobsPerCustomer, namaCustomer]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (customerId && r.customerId !== customerId) return false;
      if (!needle) return true;
      return (
        r.proyekNomor.toLowerCase().includes(needle) ||
        r.customerNama.toLowerCase().includes(needle) ||
        r.alat.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, customerId]);

  const pg = usePagination(filtered, { resetKey: `${q}|${customerId}` });

  function toggle(row: ProyekSiapTagih) {
    // BATASAN: satu proyek hanya boleh masuk satu tagihan. Proyek yang sudah
    // ada di tagihan lain ditambahkan lewat edit tagihan itu (backend &
    // database juga menolak tagihan baru untuknya).
    if (row.invoiceNumber && !selected.has(row.key)) {
      toast.error(
        `Proyek ${row.proyekNomor} sudah masuk tagihan ${row.invoiceNumber} — tambahkan lewat edit tagihan tersebut.`
      );
      return;
    }
    setSelected((prev) => {
      if (prev.has(row.key)) {
        const next = new Set(prev);
        next.delete(row.key);
        if (next.size === 0) setSelectedCustomerId(null);
        return next;
      }
      if (prev.size > 0 && selectedCustomerId && selectedCustomerId !== row.customerId) {
        toast.error(
          "Satu tagihan hanya bisa berisi proyek dari satu customer yang sama. Kosongkan pilihan dulu untuk beralih customer."
        );
        return prev;
      }
      setSelectedCustomerId(row.customerId);
      return new Set(prev).add(row.key);
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectedCustomerId(null);
  }

  function buatTagihan() {
    if (!selectedCustomerId || selected.size === 0) return;
    const jobIds = rows.filter((r) => selected.has(r.key)).flatMap((r) => r.jobIds);
    navigate("/invoices/new", { state: { customerId: selectedCustomerId, jobIds } });
  }

  return (
    // Ruang ekstra di bawah saat bar aksi tampil, supaya baris/pagination
    // terakhir tidak ketutupan bar yang `position: fixed`.
    <div className="flex flex-col gap-4" style={{ paddingBottom: selected.size > 0 ? 96 : 0 }}>
      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor proyek, customer, atau alat…"
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={rows.length === 0 ? "Tidak ada proyek siap ditagih" : "Tidak ada yang cocok"}
          description={
            rows.length === 0
              ? "Proyek muncul di sini setelah semua job-nya Selesai dan sudah divalidasi admin."
              : "Coba ubah kata kunci atau filter customer."
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="card hidden lg:block">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th style={{ width: 220 }}>Proyek</th>
                    <th>Customer</th>
                    <th>Alat</th>
                    <th style={{ width: 110, textAlign: "right" }}>Jumlah job</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.items.map((r) => {
                    const checked = selected.has(r.key);
                    const disabled = !checked && selectedCustomerId !== null && selectedCustomerId !== r.customerId;
                    return (
                      <tr key={r.key} style={{ opacity: disabled ? 0.4 : 1 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(r)}
                            title={disabled ? "Kosongkan pilihan customer lain dulu" : undefined}
                            style={{ width: 16, height: 16, cursor: disabled ? "not-allowed" : "pointer" }}
                          />
                        </td>
                        <td className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                          <TautanProyek row={r} />
                          {r.invoiceNumber && (
                            <div className="caption" style={{ fontFamily: "inherit", fontWeight: 400 }}>
                              Sudah di tagihan {r.invoiceNumber}
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 500, fontSize: 13.5 }}>{r.customerNama}</td>
                        <td className="muted" style={{ fontSize: 12.5 }}>
                          {r.alat}
                        </td>
                        <td style={{ textAlign: "right", fontSize: 13 }}>{r.jumlahJob} job</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((r) => {
              const checked = selected.has(r.key);
              const disabled = !checked && selectedCustomerId !== null && selectedCustomerId !== r.customerId;
              return (
                <label
                  key={r.key}
                  className="list-card"
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: disabled ? 0.4 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(r)}
                    style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="mono"
                      style={{ fontWeight: 600, fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8 }}
                    >
                      <TautanProyek row={r} />
                      <span style={{ fontFamily: "inherit", fontWeight: 500, whiteSpace: "nowrap" }}>
                        {r.jumlahJob} job
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.customerNama}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {r.alat}
                    </div>
                    {r.invoiceNumber && <div className="caption">Sudah di tagihan {r.invoiceNumber}</div>}
                  </div>
                </label>
              );
            })}
          </div>

          <Pagination state={pg} label="proyek" />
        </>
      )}

      {selected.size > 0 && (
        <div className="selection-bar">
          <div
            className="card card-pad"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              maxWidth: 460,
              boxShadow: "0 8px 28px rgba(0,0,0,0.18)"
            }}
          >
            <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
              <strong>{selected.size}</strong> proyek dipilih —{" "}
              {namaCustomer[selectedCustomerId ?? ""] ?? ""}
            </span>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                Batal
              </Button>
              <Button size="sm" onClick={buatTagihan}>
                Buat tagihan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
