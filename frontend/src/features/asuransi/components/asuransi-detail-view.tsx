import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, MapPin, MessageCircle, Pencil, Phone, PowerOff, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { tautanWhatsApp } from "@/lib/server-page";
import { formatDate, formatRupiah } from "@/lib/utils";
import { DaftarPerintahKerja } from "@/features/perintah-kerja/components/daftar-perintah-kerja";
import { KEADAAN_POLIS, deleteAsuransi, setAsuransiAktif, type Asuransi } from "../api";
import { usePolisMilikAsuransi } from "../queries";

export function AsuransiDetailView({ asuransi }: { asuransi: Asuransi }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const polis = usePolisMilikAsuransi(asuransi.id);
  const [tab, setTab] = useState<"polis" | "klaim">("polis");
  const [konfirmasi, setKonfirmasi] = useState<"hapus" | "nonaktif" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function aksi(jenis: "hapus" | "nonaktif" | "aktif") {
    setBusy(jenis === "hapus" ? "Menghapus asuransi…" : "Menyimpan…");
    const res = jenis === "hapus" ? await deleteAsuransi(asuransi.id) : await setAsuransiAktif(asuransi.id, jenis === "aktif");
    setBusy(null);
    setKonfirmasi(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      jenis === "hapus" ? "Asuransi dihapus" : jenis === "aktif" ? "Asuransi diaktifkan" : "Asuransi dinonaktifkan"
    );
    if (jenis === "hapus") navigate("/asuransi");
  }

  const daftarPolis = polis.data ?? [];

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="card card-pad-lg">
          <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 12 }}>
            <div className="flex gap-3">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: "var(--brand-primary-light)",
                  color: "var(--brand-primary-dark)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <ShieldCheck style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="h1" style={{ fontSize: 24 }}>
                    {asuransi.nama}
                  </div>
                  {!asuransi.is_active && <span className="badge">Nonaktif</span>}
                </div>
                <div className="body-sm muted">
                  {asuransi.jumlah_aset_aktif > 0
                    ? `Melindungi ${asuransi.jumlah_aset_aktif} aset saat ini`
                    : "Belum ada aset dengan polis berlaku"}
                </div>
              </div>
            </div>
            {canManageOperational && (
              <div className="flex gap-2 flex-wrap">
                <Link to={`/asuransi/${asuransi.id}/edit`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                  <Pencil style={{ width: 14, height: 14 }} />
                  Edit
                </Link>
                {asuransi.is_active ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<PowerOff className="w-3.5 h-3.5" />}
                    onClick={() => setKonfirmasi("nonaktif")}
                  >
                    Nonaktifkan
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => aksi("aktif")}>
                    Aktifkan
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setKonfirmasi("hapus")}
                >
                  Hapus
                </Button>
              </div>
            )}
          </div>
          <div className="divider" style={{ marginBottom: 12 }} />
          <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
            {asuransi.telepon && (
              <a href={`tel:${asuransi.telepon}`} className="inline-flex items-center gap-2">
                <Phone style={{ width: 14, height: 14 }} />
                {asuransi.telepon}
              </a>
            )}
            {asuransi.email && (
              <a href={`mailto:${asuransi.email}`} className="inline-flex items-center gap-2">
                <Mail style={{ width: 14, height: 14 }} />
                {asuransi.email}
              </a>
            )}
            {asuransi.alamat && (
              <span className="inline-flex items-start gap-2">
                <MapPin style={{ width: 14, height: 14, marginTop: 2 }} />
                {asuransi.alamat}
              </span>
            )}
            {asuransi.catatan && <p className="caption">{asuransi.catatan}</p>}
          </div>
        </div>

        <div className="card">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as "polis" | "klaim")}
            items={[
              { key: "polis", label: "Aset & polis", count: daftarPolis.length },
              { key: "klaim", label: "Riwayat klaim" }
            ]}
          />
          {tab === "polis" ? (
            daftarPolis.length === 0 ? (
              <p className="caption" style={{ padding: 16 }}>
                {polis.isPending ? "Memuat polis…" : "Belum ada unit / unit trailer yang di-link ke asuransi ini."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Aset</th>
                      <th>No. polis</th>
                      <th>Periode</th>
                      <th style={{ textAlign: "right" }}>Own risk</th>
                      <th>Keadaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daftarPolis.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>
                          <Link to={p.unit_id ? `/units/${p.unit_id}` : `/unit-trailer/${p.unit_trailer_id}`}>
                            {p.kode_aset ?? "—"}
                          </Link>
                          <div className="caption">{p.unit_id ? "Unit" : "Unit trailer"}</div>
                        </td>
                        <td className="mono">{p.nomor_polis}</td>
                        <td>
                          {formatDate(p.mulai)} – {formatDate(p.berakhir)}
                        </td>
                        <td style={{ textAlign: "right" }}>{p.own_risk != null ? formatRupiah(p.own_risk) : "—"}</td>
                        <td>
                          <span className={`badge ${KEADAAN_POLIS[p.keadaan].kelas}`}>
                            {KEADAAN_POLIS[p.keadaan].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div style={{ padding: 12 }}>
              <DaftarPerintahKerja
                dasar={{ asuransi_id: asuransi.id }}
                kosong="Belum ada perbaikan yang diklaim ke asuransi ini."
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            PIC yang bisa dihubungi
          </div>
          <div className="flex flex-col gap-3">
            {asuransi.pic.map((p) => {
              const wa = tautanWhatsApp(p.no_hp);
              return (
                <div key={p.id} style={{ paddingBottom: 10, borderBottom: "0.5px solid var(--border-default)" }}>
                  <div className="flex items-center gap-2" style={{ fontWeight: 600 }}>
                    {p.sapaan ? `${p.sapaan} ` : ""}
                    {p.nama}
                    {p.is_utama && (
                      <span className="badge badge-status-standby" style={{ height: 18, fontSize: 10 }}>
                        <Star style={{ width: 10, height: 10 }} /> Utama
                      </span>
                    )}
                  </div>
                  {p.jabatan && <div className="caption">{p.jabatan}</div>}
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 6 }}>
                    <a href={`tel:${p.no_hp}`}>
                      <Button size="sm" variant="secondary" leftIcon={<Phone className="w-3.5 h-3.5" />}>
                        {p.no_hp}
                      </Button>
                    </a>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="secondary" leftIcon={<MessageCircle className="w-3.5 h-3.5" />}>
                          WhatsApp
                        </Button>
                      </a>
                    )}
                    {p.email && (
                      <a href={`mailto:${p.email}`}>
                        <Button size="sm" variant="ghost" leftIcon={<Mail className="w-3.5 h-3.5" />}>
                          Email
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            Bengkel rekanan
          </div>
          {asuransi.bengkel_rekanan.length === 0 ? (
            <p className="caption">Belum dicatat.</p>
          ) : (
            <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
              {asuransi.bengkel_rekanan.map((b) => (
                <div key={b.id}>
                  <div style={{ fontWeight: 600 }}>{b.nama}</div>
                  <div className="caption">{[b.alamat, b.kontak].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={konfirmasi !== null}
        onClose={() => setKonfirmasi(null)}
        title={konfirmasi === "hapus" ? `Hapus asuransi ${asuransi.nama}?` : `Nonaktifkan asuransi ${asuransi.nama}?`}
        body={
          konfirmasi === "hapus"
            ? "Asuransi yang sudah dipakai di polis unit / unit trailer tidak bisa dihapus — nonaktifkan saja."
            : "Asuransi nonaktif tidak muncul di pilihan polis baru. Polis yang sudah ada tetap tersimpan."
        }
        confirmText={konfirmasi === "hapus" ? "Ya, hapus" : "Ya, nonaktifkan"}
        variant="danger"
        loading={busy !== null}
        onConfirm={() => aksi(konfirmasi === "hapus" ? "hapus" : "nonaktif")}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}
