import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { simpanKeputusanItem } from "@/features/quotations/api";
import { keputusanItemLabel, type KeputusanItem, type Quotation } from "@/types";
import { formatRupiah } from "@/lib/utils";

interface Baris {
  keputusan: KeputusanItem;
  /** Digit polos; "" = pakai harga awal. */
  harga: string;
  alasan: string;
}

function awal(q: Quotation): Record<string, Baris> {
  return Object.fromEntries(
    q.items.map((it) => [
      it.id,
      {
        keputusan: it.keputusan,
        harga: it.harga_revisi != null ? String(Math.round(it.harga_revisi)) : "",
        alasan: it.alasan_ditolak ?? ""
      }
    ])
  );
}

/**
 * Keputusan customer per item penawaran: deal (boleh dengan harga revisi —
 * harga awal tetap tercatat) atau ditolak. Status penawaran dihitung ulang
 * dari semua item: ada yang deal → Deal, semua ditolak → Ditolak, masih ada
 * yang menunggu → tetap Terkirim.
 */
export function KeputusanItemModal({
  quotation: q,
  open,
  onClose
}: {
  quotation: Quotation;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [baris, setBaris] = useState<Record<string, Baris>>(() => awal(q));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setBaris(awal(q));
  }, [open, q]);

  function ubah(id: string, patch: Partial<Baris>) {
    setBaris((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
  }

  function semua(keputusan: KeputusanItem) {
    setBaris((b) => {
      const next = { ...b };
      for (const it of q.items) if (it.jumlah_job === 0) next[it.id] = { ...next[it.id], keputusan };
      return next;
    });
  }

  async function simpan() {
    setSaving(true);
    const res = await simpanKeputusanItem(
      q.id,
      q.items.map((it) => {
        const b = baris[it.id];
        return {
          item_id: it.id,
          keputusan: b.keputusan,
          harga_revisi: b.keputusan === "deal" && b.harga !== "" ? Number(b.harga) : null,
          alasan: b.keputusan === "ditolak" ? b.alasan.trim() || null : null
        };
      })
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Keputusan item penawaran disimpan");
    onClose();
  }

  const nilai = Object.values(baris);
  const ringkas = {
    deal: nilai.filter((b) => b.keputusan === "deal").length,
    ditolak: nilai.filter((b) => b.keputusan === "ditolak").length,
    menunggu: nilai.filter((b) => b.keputusan === "menunggu").length
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keputusan per item penawaran"
      description={
        ringkas.menunggu > 0
          ? `${ringkas.menunggu} item masih menunggu — penawaran tetap berstatus Terkirim sampai semua item diputuskan.`
          : ringkas.deal > 0
            ? `${ringkas.deal} item deal, ${ringkas.ditolak} ditolak — penawaran akan berstatus Deal.`
            : "Semua item ditolak — penawaran akan berstatus Ditolak."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={() => void simpan()} loading={saving}>
            Simpan keputusan
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <Button size="sm" variant="secondary" onClick={() => semua("deal")}>
          Semua deal
        </Button>
        <Button size="sm" variant="secondary" onClick={() => semua("ditolak")}>
          Semua ditolak
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {q.items.map((it, idx) => {
          const b = baris[it.id];
          if (!b) return null;
          const terkunci = it.jumlah_job > 0;
          return (
            <div
              key={it.id}
              style={{
                border: "0.5px solid var(--border-default)",
                borderRadius: 8,
                padding: 12,
                opacity: terkunci ? 0.75 : 1
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {idx + 1}. {it.dari} → {it.tujuan}
              </div>
              <div className="caption" style={{ marginBottom: 8 }}>
                {it.qty} {it.satuan}
                {it.nama_alat ? ` ${it.nama_alat}` : ""} · harga awal {formatRupiah(it.harga_satuan)}
                {terkunci && ` · sudah dibuat ${it.jumlah_job} job — tidak bisa diubah`}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, alignItems: "start" }}>
                <Select
                  value={b.keputusan}
                  disabled={terkunci}
                  aria-label={`Keputusan item ${idx + 1}`}
                  onChange={(e) => ubah(it.id, { keputusan: e.target.value as KeputusanItem })}
                >
                  {(Object.keys(keputusanItemLabel) as KeputusanItem[]).map((k) => (
                    <option key={k} value={k}>
                      {keputusanItemLabel[k]}
                    </option>
                  ))}
                </Select>
                {b.keputusan === "deal" && (
                  <div>
                    <CurrencyInput
                      value={b.harga}
                      disabled={terkunci}
                      onChange={(v) => ubah(it.id, { harga: v })}
                      placeholder={`Revisi harga satuan (kosong = ${formatRupiah(it.harga_satuan)})`}
                      aria-label={`Harga revisi item ${idx + 1}`}
                    />
                    {b.harga !== "" && (
                      <div className="caption" style={{ marginTop: 4 }}>
                        Total {formatRupiah(Number(b.harga) * it.qty)} (awal {formatRupiah(it.subtotal)})
                      </div>
                    )}
                  </div>
                )}
                {b.keputusan === "ditolak" && (
                  <Input
                    value={b.alasan}
                    disabled={terkunci}
                    onChange={(e) => ubah(it.id, { alasan: e.target.value })}
                    placeholder="Alasan ditolak (opsional)"
                    aria-label={`Alasan item ${idx + 1} ditolak`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
