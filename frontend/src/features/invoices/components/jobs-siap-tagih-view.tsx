import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";
import type { Customer, JobBelumDitagihRow } from "@/types";
import { InfoUangJalanSurat } from "./info-uang-jalan-surat";

interface Props {
  /** Job selesai & tervalidasi yang belum masuk tagihan mana pun, per customer. */
  jobsPerCustomer: Record<string, JobBelumDitagihRow[]>;
  customers: Customer[];
}

interface Row {
  job: JobBelumDitagihRow;
  customerId: string;
  customerNama: string;
}

/**
 * Tab "Job siap ditagih": job selesai yang belum ditagih, dicentang lalu
 * digabung jadi satu tagihan. Satu tagihan hanya boleh berisi job dari satu
 * customer yang sama — begitu ada job tercentang, job customer lain otomatis
 * dikunci sampai pilihan dikosongkan lagi.
 */
export function JobsSiapTagihView({ jobsPerCustomer, customers }: Props) {
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

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [cid, jobs] of Object.entries(jobsPerCustomer)) {
      for (const job of jobs) {
        out.push({ job, customerId: cid, customerNama: namaCustomer[cid] ?? "Customer tidak dikenal" });
      }
    }
    // Yang paling lama menunggu ditagih tampil di atas.
    out.sort((a, b) => (a.job.completed_at ?? a.job.etd).localeCompare(b.job.completed_at ?? b.job.etd));
    return out;
  }, [jobsPerCustomer, namaCustomer]);

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
        r.job.job_number.toLowerCase().includes(needle) ||
        r.customerNama.toLowerCase().includes(needle) ||
        r.job.alat_diangkut.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, customerId]);

  const pg = usePagination(filtered, { resetKey: `${q}|${customerId}` });

  function toggle(row: Row) {
    setSelected((prev) => {
      if (prev.has(row.job.id)) {
        const next = new Set(prev);
        next.delete(row.job.id);
        if (next.size === 0) setSelectedCustomerId(null);
        return next;
      }
      if (prev.size > 0 && selectedCustomerId && selectedCustomerId !== row.customerId) {
        toast.error(
          "Satu tagihan hanya bisa berisi job dari satu customer yang sama. Kosongkan pilihan dulu untuk beralih customer."
        );
        return prev;
      }
      setSelectedCustomerId(row.customerId);
      return new Set(prev).add(row.job.id);
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectedCustomerId(null);
  }

  function buatTagihan() {
    if (!selectedCustomerId || selected.size === 0) return;
    navigate("/invoices/new", {
      state: { customerId: selectedCustomerId, jobIds: Array.from(selected) }
    });
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
            placeholder="Cari nomor job, customer, atau alat…"
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
          title={rows.length === 0 ? "Tidak ada job siap ditagih" : "Tidak ada yang cocok"}
          description={
            rows.length === 0
              ? "Job muncul di sini setelah statusnya Selesai dan sudah divalidasi admin."
              : "Coba ubah kata kunci atau filter customer."
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="card hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th style={{ width: 140 }}>Job ID</th>
                  <th>Customer</th>
                  <th>Alat</th>
                  <th>Rute</th>
                  <th style={{ width: 140 }}>Uang jalan / Surat jalan</th>
                  <th style={{ width: 110 }}>Selesai</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r) => {
                  const checked = selected.has(r.job.id);
                  const disabled = !checked && selectedCustomerId !== null && selectedCustomerId !== r.customerId;
                  return (
                    <tr key={r.job.id} style={{ opacity: disabled ? 0.4 : 1 }}>
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
                        {r.job.job_number}
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13.5 }}>{r.customerNama}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {r.job.alat_diangkut}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.job.asal} → {r.job.tujuan}
                      </td>
                      <td>
                        <InfoUangJalanSurat
                          uangJalanPagu={r.job.uang_jalan_pagu}
                          uangJalanCair={r.job.uang_jalan_cair}
                          suratJalanUrls={r.job.surat_jalan_urls}
                        />
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {r.job.completed_at ? formatDate(r.job.completed_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((r) => {
              const checked = selected.has(r.job.id);
              const disabled = !checked && selectedCustomerId !== null && selectedCustomerId !== r.customerId;
              return (
                <label
                  key={r.job.id}
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
                    <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                      {r.job.job_number}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.customerNama}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {r.job.alat_diangkut}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {r.job.asal} → {r.job.tujuan}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: 8,
                        marginTop: 2
                      }}
                    >
                      <InfoUangJalanSurat
                        uangJalanPagu={r.job.uang_jalan_pagu}
                        uangJalanCair={r.job.uang_jalan_cair}
                        suratJalanUrls={r.job.surat_jalan_urls}
                      />
                      <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        Selesai {r.job.completed_at ? formatDate(r.job.completed_at) : "—"}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <Pagination state={pg} label="job" />
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
              <strong>{selected.size}</strong> job dipilih —{" "}
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
