import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Flag, MapPin, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { proyekDibatalkan } from "../status";
import { formatDate, formatTime } from "@/lib/utils";
import { TagihanJobInfo } from "@/features/jobs/components/tagihan-job-info";
import { GantiUnitUlangModal } from "@/features/jobs/components/penggantian-modal";
import type { Job, ProyekDetail } from "@/types";

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

/**
 * Job pengganti (ganti unit) yang dibatalkan untuk job lama `job`. BATASAN:
 * tombol "Selesaikan job dengan unit lain" hanya untuk job lama Selesai yang SEMUA job
 * penggantinya dibatalkan (dijaga juga database, buat_ulang_job_pengganti).
 */
function penggantiBatal(job: Job, semua: Job[]): Job[] {
  const pengganti = semua.filter((x) => x.menggantikan_job_id === job.id);
  if (job.status !== "selesai" || pengganti.length === 0) return [];
  return pengganti.every((x) => x.status === "cancelled") ? pengganti : [];
}

export function ProyekDetailView({ proyek, hanyaLihat }: { proyek: ProyekDetail; hanyaLihat: boolean }) {
  // Job lama yang sedang dibuatkan job pengganti baru.
  const [gantiUlang, setGantiUlang] = useState<Job | null>(null);
  // Filter daftar job: default "Aktif" (job dibatalkan disembunyikan).
  const [filterJob, setFilterJob] = useState<"aktif" | "semua">("aktif");
  const jobAktif = proyek.jobs.filter((j) => j.status !== "cancelled");
  const jobTampil = filterJob === "aktif" ? jobAktif : proyek.jobs;
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
              <Link to={`/proyek/${proyek.id}/tambah-job`}>
                <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>Tambah job</Button>
              </Link>
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
        <div className="card-header">
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
        <div className="flex flex-col">
          {jobTampil.length === 0 && (
            <div className="caption" style={{ padding: 16 }}>
              Tidak ada job aktif — semua job di proyek ini dibatalkan.
            </div>
          )}
          {jobTampil.map((j) => (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              className="row-link"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                gap: 12,
                alignItems: "center",
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
                <div className="caption" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MapPin style={{ width: 11, height: 11 }} /> {j.asal}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Flag style={{ width: 11, height: 11 }} /> {j.tujuan}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <StatusBadge status={j.status} />
                <TagihanJobInfo job={j} ringkas />
                {!hanyaLihat && penggantiBatal(j, proyek.jobs).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div className="caption" style={{ color: "var(--status-cancelled-text)", marginBottom: 4 }}>
                      Job pengganti {penggantiBatal(j, proyek.jobs).map((x) => x.job_number).join(", ")} dibatalkan
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      // Baris berupa tautan ke detail job — tombol tidak ikut membuka tautan.
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGantiUlang(j);
                      }}
                    >
                      Selesaikan job dengan unit lain
                    </button>
                  </div>
                )}
              </div>
              <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} />
            </Link>
          ))}
        </div>
      </div>
      {gantiUlang && (
        <GantiUnitUlangModal
          job={gantiUlang}
          penggantiBatal={penggantiBatal(gantiUlang, proyek.jobs).map((x) => x.job_number)}
          onClose={() => setGantiUlang(null)}
        />
      )}
    </div>
  );
}
