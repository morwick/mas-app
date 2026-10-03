import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Flag, MapPin, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { proyekDibatalkan } from "../status";
import { jejakDariProyek } from "@/components/layout/judul-halaman";
import { formatDate, formatRupiah, formatTime } from "@/lib/utils";
import { InvoiceStatusBadge, StatusBayarBadge } from "@/features/invoices/components/invoice-status-badge";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import type { ProyekBiayaJob, ProyekDetail, ProyekTagihan } from "@/types";

/** Kolom daftar job: info job · uang jalan · biaya lain · status · panah. */
const BARIS_JOB = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) 190px 120px 140px 16px",
  minWidth: 720,
  gap: 12,
  alignItems: "center"
} as const;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="caption" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{children}</div>
    </div>
  );
}

export function ProyekDetailView({ proyek, hanyaLihat }: { proyek: ProyekDetail; hanyaLihat: boolean }) {
  // Filter daftar job: default "Aktif" (job dibatalkan disembunyikan).
  const [filterJob, setFilterJob] = useState<"aktif" | "semua">("aktif");
  const jobAktif = proyek.jobs.filter((j) => j.status !== "cancelled");
  const jobTampil = filterJob === "aktif" ? jobAktif : proyek.jobs;
  const biaya = proyek.biaya_job ?? {};
  // Total proyek dari job yang tidak dibatalkan.
  const totalBiaya = jobAktif.reduce(
    (acc, j) => ({
      cair: acc.cair + (biaya[j.id]?.cair ?? 0),
      uangJalan: acc.uangJalan + (biaya[j.id]?.uang_jalan ?? 0),
      lain: acc.lain + (biaya[j.id]?.biaya_lain ?? 0)
    }),
    { cair: 0, uangJalan: 0, lain: 0 }
  );
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <Link to="/proyek" className="caption" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft style={{ width: 13, height: 13 }} /> Daftar proyek
        </Link>
      </div>

      <div className="card card-pad-lg">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="caption">Proyek</div>
            <h1 className="h1 mono" style={{ margin: "2px 0 0" }}>
              {proyek.nomor_proyek}
            </h1>
            {proyekDibatalkan(proyek) && <StatusBadge status="cancelled" className="mt-2" />}
          </div>
          {!hanyaLihat && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Link to={`/proyek/${proyek.id}/edit`}>
                <Button variant="secondary" leftIcon={<Pencil style={{ width: 14, height: 14 }} />}>
                  Ubah proyek
                </Button>
              </Link>
              {/* BATASAN: proyek yang sudah masuk tagihan aktif tidak bisa ditambah
                  job (dijaga juga backend & database); tagihan dibatalkan → boleh lagi. */}
              {proyek.invoice_id ? (
                <Button
                  leftIcon={<Plus style={{ width: 16, height: 16 }} />}
                  disabled
                  title={`Proyek sudah masuk tagihan ${proyek.invoice_number ?? ""} — batalkan tagihannya dulu untuk menambah job.`}
                >
                  Tambah job
                </Button>
              ) : (
                <Link to={`/proyek/${proyek.id}/tambah-job`}>
                  <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>Tambah job</Button>
                </Link>
              )}
            </div>
          )}
        </div>

        <div
          className="grid grid-cols-2 lg:grid-cols-5"
          style={{ gap: 16, marginTop: 16, paddingTop: 16, borderTop: "0.5px dashed var(--border-default)" }}
        >
          <Info label="Customer">
            {proyek.customer_nama ?? <span className="caption">Tanpa customer (kosongan)</span>}
          </Info>
          <Info label="PIC lapangan">
            {proyek.pic_nama ? (
              <>
                {proyek.pic_nama}
                {proyek.pic_no_hp && (
                  <div className="mono caption" style={{ fontSize: 12 }}>
                    {proyek.pic_no_hp}
                  </div>
                )}
              </>
            ) : (
              "—"
            )}
          </Info>
          <Info label="Unit / penawaran">
            <span className="mono">{proyek.unit_kode || "—"}</span>
            {proyek.quote_number && <div className="caption mono">{proyek.quote_number}</div>}
          </Info>
          <Info label="Dibuat">
            {formatDate(proyek.created_at)}
            {proyek.created_by_nama ? ` · ${proyek.created_by_nama}` : ""}
          </Info>
          <Info label="Job & tagihan">
            {proyek.jumlah_job} job · {proyek.jumlah_job_selesai} selesai
            {proyek.jumlah_job_batal > 0 ? ` · ${proyek.jumlah_job_batal} batal` : ""}
            {/* Kosongan (tanpa customer) tidak pernah ditagih — tanpa status tagihan. */}
            {(proyek.invoice_number || proyek.customer_id) && (
              <div className="caption">
                {proyek.invoice_number ? <span className="mono">{proyek.invoice_number}</span> : "Belum ditagih"}
              </div>
            )}
          </Info>
        </div>
      </div>

      <div className="card">
        <div className="card-header card-header-warna">
          <div>
            <p className="eyebrow">Job di proyek ini</p>
            <p className="caption">Setiap job punya surat jalan sendiri.</p>
          </div>
          <FilterChips
            value={filterJob}
            onChange={(k) => setFilterJob(k as "aktif" | "semua")}
            items={[
              { key: "aktif", label: `Aktif (${jobAktif.length})` },
              { key: "semua", label: `Semua (${proyek.jobs.length})` }
            ]}
          />
        </div>
        {/* Kolom lebar tetap — di layar sempit daftar bisa digeser ke samping. */}
        <div className="flex flex-col" style={{ overflowX: "auto" }}>
          {jobTampil.length === 0 && (
            <div className="caption" style={{ padding: 16 }}>
              Tidak ada job aktif — semua job di proyek ini dibatalkan.
            </div>
          )}
          {jobTampil.length > 0 && (
            <div
              className="caption"
              style={{ ...BARIS_JOB, padding: "8px 16px", borderTop: "0.5px solid var(--border-default)", fontWeight: 600 }}
            >
              <span>Job</span>
              <span style={{ textAlign: "right" }}>Uang jalan (cair / job)</span>
              <span style={{ textAlign: "right" }}>Biaya lain</span>
              <span style={{ textAlign: "right" }}>Status</span>
              <span />
            </div>
          )}
          {jobTampil.map((j) => (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              // Header job: "Proyek / Detail Proyek / Detail Job".
              state={jejakDariProyek(proyek.id)}
              className="row-link"
              style={{
                ...BARIS_JOB,
                padding: "12px 16px",
                borderTop: "0.5px solid var(--border-default)",
                color: "inherit",
                textDecoration: "none"
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {j.job_number}
                  <span className="caption" style={{ marginLeft: 8 }}>
                    {formatDate(j.etd)} {formatTime(j.etd)}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{j.alat_diangkut}</div>
                {/* Asal & tujuan masing-masing satu baris dengan ikonnya. */}
                <div className="caption" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} /> {j.asal}
                </div>
                <div className="caption" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Flag style={{ width: 11, height: 11, flexShrink: 0 }} /> {j.tujuan}
                </div>
              </div>
              <KolomUangJalan biaya={biaya[j.id]} />
              <div className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                {formatRupiah(biaya[j.id]?.biaya_lain ?? 0)}
              </div>
              {/* Info tagihan tidak per job — lihat daftar Tagihan di bawah. */}
              <div style={{ textAlign: "right" }}>
                <StatusBadge status={j.status} />
              </div>
              <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} />
            </Link>
          ))}
          {jobAktif.length > 0 && (
            <div
              style={{
                ...BARIS_JOB,
                padding: "10px 16px",
                borderTop: "0.5px solid var(--border-default)",
                background: "var(--bg-muted)",
                fontWeight: 700,
                fontSize: 13
              }}
            >
              <span>
                Total <span className="caption" style={{ fontWeight: 400 }}>(tanpa job dibatalkan)</span>
              </span>
              <span className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                {formatRupiah(totalBiaya.cair)}
                <div className="caption" style={{ fontWeight: 400 }}>
                  dari {formatRupiah(totalBiaya.uangJalan)}
                </div>
              </span>
              <span className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                {formatRupiah(totalBiaya.lain)}
              </span>
              <span />
              <span />
            </div>
          )}
        </div>
      </div>

      <TagihanProyek tagihan={proyek.tagihan ?? []} kosongan={!proyek.customer_id} />
    </div>
  );
}

/**
 * Tagihan yang pernah dibuat untuk proyek ini, termasuk yang dibatalkan,
 * urut dibuat paling awal. Superadmin & finance: bisa dibuka + nominal;
 * admin: nomor & status saja; operator: backend tidak mengirim (tidak tampil).
 */
function TagihanProyek({ tagihan, kosongan }: { tagihan: ProyekTagihan[]; kosongan: boolean }) {
  const role = useCurrentUser().role;
  const lengkap = role === "superadmin" || role === "finance";
  // Filter: default "Aktif" (tagihan dibatalkan disembunyikan), sama dengan daftar job.
  const [filter, setFilter] = useState<"aktif" | "semua">("aktif");
  const tagihanAktif = tagihan.filter((t) => t.status_tampil !== "batal");
  const tampil = filter === "aktif" ? tagihanAktif : tagihan;
  // Operator tidak menerima info tagihan; kosongan memang tidak pernah ditagih.
  if (role === "operator" || (kosongan && tagihan.length === 0)) return null;
  return (
    <div className="card">
      <div className="card-header card-header-warna">
        <div>
          <p className="eyebrow">Tagihan</p>
          <p className="caption">Tagihan yang pernah dibuat untuk proyek ini, urut dari yang pertama dibuat.</p>
        </div>
        <FilterChips
          value={filter}
          onChange={(k) => setFilter(k as "aktif" | "semua")}
          items={[
            { key: "aktif", label: `Aktif (${tagihanAktif.length})` },
            { key: "semua", label: `Semua (${tagihan.length})` }
          ]}
        />
      </div>
      <div className="flex flex-col">
        {tampil.length === 0 && (
          <div className="caption" style={{ padding: 16, borderTop: "0.5px solid var(--border-default)" }}>
            {tagihan.length === 0
              ? "Belum ada tagihan untuk proyek ini."
              : "Tidak ada tagihan aktif — semua tagihan proyek ini dibatalkan."}
          </div>
        )}
        {tampil.map((t) => {
          const batal = t.status_tampil === "batal";
          const isi = (
            <>
              <div style={{ minWidth: 0, opacity: batal ? 0.7 : 1 }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {t.invoice_number}
                  <span className="caption" style={{ marginLeft: 8 }}>
                    {formatDate(t.tanggal)}
                  </span>
                </div>
                {lengkap && t.total !== null && (
                  <div className="caption mono">
                    {formatRupiah(t.total)}
                    {!batal && t.sisa ? ` · sisa ${formatRupiah(t.sisa)}` : ""}
                  </div>
                )}
                {batal && t.alasan_batal && <div className="caption">Alasan batal: {t.alasan_batal}</div>}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <InvoiceStatusBadge status={t.status_tampil} />
                {!batal && <StatusBayarBadge status={t.status_bayar} />}
              </div>
              {lengkap ? <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} /> : <span />}
            </>
          );
          const gaya = {
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto auto",
            gap: 12,
            alignItems: "center",
            padding: "12px 16px",
            borderTop: "0.5px solid var(--border-default)",
            color: "inherit",
            textDecoration: "none"
          } as const;
          return lengkap ? (
            <Link key={t.id} to={`/invoices/${t.id}`} className="row-link" style={gaya}>
              {isi}
            </Link>
          ) : (
            <div key={t.id} style={gaya}>
              {isi}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Kolom uang jalan satu job: yang sudah cair, di bawahnya uang jalan job & sisanya. */
function KolomUangJalan({ biaya }: { biaya?: ProyekBiayaJob }) {
  if (!biaya) return <div className="caption" style={{ textAlign: "right" }}>—</div>;
  return (
    <div className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
      {formatRupiah(biaya.cair)}
      <div className="caption">
        dari {formatRupiah(biaya.uang_jalan)}
        {biaya.sisa > 0 && ` · sisa ${formatRupiah(biaya.sisa)}`}
      </div>
    </div>
  );
}
