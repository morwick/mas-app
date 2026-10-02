import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "@/lib/utils";
import type { QuotationItem, QuotationJobRef } from "@/types";

interface BarisProyek {
  key: string;
  /** Nomor urut item di penawaran (1, 2, …); null = job tanpa item. */
  nomorItem: number | null;
  proyekId: string;
  proyekNomor: string | null;
  dibuat: string | null;
  oleh: string | null;
}

/**
 * Satu baris per (item penawaran, proyek), diambil dari job yang lahir dari
 * penawaran ini. Urut nomor item, lalu nomor proyek; tanpa item paling bawah.
 */
function barisProyek(items: QuotationItem[], jobs: QuotationJobRef[]): BarisProyek[] {
  const nomor = new Map(items.map((it, i) => [it.id, i + 1]));
  const map = new Map<string, BarisProyek>();
  for (const j of jobs) {
    if (!j.proyek_id) continue;
    const key = `${j.quotation_item_id ?? "-"}|${j.proyek_id}`;
    if (map.has(key)) continue;
    map.set(key, {
      key,
      nomorItem: j.quotation_item_id ? nomor.get(j.quotation_item_id) ?? null : null,
      proyekId: j.proyek_id,
      proyekNomor: j.proyek_nomor ?? null,
      dibuat: j.proyek_created_at ?? null,
      oleh: j.proyek_created_by_nama ?? null
    });
  }
  return [...map.values()].sort(
    (a, b) =>
      (a.nomorItem ?? Infinity) - (b.nomorItem ?? Infinity) ||
      (a.proyekNomor ?? "").localeCompare(b.proyekNomor ?? "")
  );
}

/** Proyek dari penawaran: item penawaran, nomor proyek, kapan & oleh siapa dibuat. */
export function ProyekPenawaran({ items, jobs }: { items: QuotationItem[]; jobs: QuotationJobRef[] }) {
  const baris = useMemo(() => barisProyek(items, jobs), [items, jobs]);

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 130 }}>Item penawaran</th>
            <th>No. proyek</th>
            <th style={{ width: 180 }}>Dibuat</th>
            <th style={{ width: 180 }}>Oleh</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.key}>
              <td style={{ fontWeight: 600, fontSize: 13 }}>
                {b.nomorItem ? `Item #${b.nomorItem}` : "—"}
              </td>
              <td>
                <Link to={`/proyek/${b.proyekId}`} className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {b.proyekNomor ?? "—"}
                </Link>
              </td>
              <td className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                {b.dibuat ? formatDateTime(b.dibuat) : "—"}
              </td>
              <td style={{ fontSize: 12.5 }}>{b.oleh ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
