import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Container, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { HapusAtauNonaktifkan } from "@/features/units/components/hapus-atau-nonaktifkan";
import { Tabs } from "@/components/ui/tabs";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  DetailField,
  DokumenCard,
  InsidenPanel,
  JobAktifTab,
  RiwayatJobTab,
  RiwayatStatusTab,
  UtilisasiCard,
  hitungInsiden,
  isJobAktif,
  utilisasiSementara
} from "@/features/units/components/aset-detail-parts";
import { useJenisUnit } from "@/features/settings/queries";
import type { Incident, Job, UnitStatusHistoryEntry } from "@/types";
import {
  createJenisUnitTrailer,
  updateUnitTrailer,
  type JenisUnitTrailer,
  type UnitTrailer,
  type DokumenTrailer,
  type UnitTrailerInput
} from "../api";
import { useJenisUnitTrailer } from "../queries";
import { UnitTrailerFormModal } from "./unit-trailer-form-modal";
import { KartuAsuransi } from "@/features/asuransi/components/polis-aset";
import { TabPerbaikan } from "@/features/perintah-kerja/components/tab-perbaikan";

interface Props {
  trailer: UnitTrailer;
  jobs: Job[];
  history: UnitStatusHistoryEntry[];
  incidents: Incident[];
}

type TabKey = "aktif" | "riwayat" | "history" | "insiden" | "perbaikan";

function formatKapasitas(ton: number | null) {
  if (ton == null) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(ton)} ton`;
}

/**
 * Detail unit trailer — isi & perilakunya sama dengan detail unit: status,
 * job aktif / riwayat job, riwayat status, insiden, dan dokumen (KIR & SRUT).
 */
export function UnitTrailerDetailView({ trailer, jobs, history, incidents }: Props) {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { canManageOperational } = useAuth();

  const initialTab: TabKey = ((): TabKey => {
    const qp = searchParams.get("tab");
    if (qp === "insiden" || qp === "history" || qp === "riwayat" || qp === "aktif" || qp === "perbaikan") return qp;
    return trailer.status === "bertugas" ? "aktif" : "riwayat";
  })();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [editOpen, setEditOpen] = useState(false);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);

  const jenis = useJenisUnitTrailer();
  const jenisUnit = useJenisUnit();
  const [jenisTambahan, setJenisTambahan] = useState<JenisUnitTrailer[]>([]);
  const jenisList = [
    ...(jenis.data ?? []),
    ...jenisTambahan.filter((j) => !(jenis.data ?? []).some((x) => x.id === j.id))
  ];

  const activeJob = useMemo(() => jobs.find(isJobAktif), [jobs]);
  const pastJobs = useMemo(() => jobs.filter((j) => !isJobAktif(j)), [jobs]);
  const utilisasi = useMemo(() => utilisasiSementara(jobs, trailer.status), [jobs, trailer.status]);

  async function simpan(input: UnitTrailerInput, dokumen: DokumenTrailer): Promise<boolean> {
    setBusy(`Menyimpan perubahan ${trailer.kode_trailer}…`);
    const res = await updateUnitTrailer(trailer.id, input, dokumen);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`Unit trailer ${input.kode_trailer} diperbarui`);
    setEditOpen(false);
    return true;
  }

  async function tambahJenis(nama: string, jenisUnitId: string): Promise<JenisUnitTrailer | null> {
    setBusy(`Menambahkan jenis unit trailer ${nama}…`);
    const res = await createJenisUnitTrailer(nama, jenisUnitId);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setJenisTambahan((list) => [...list, res.data]);
    toast.success(`Jenis unit trailer ${res.data.nama} ditambahkan`);
    return res.data;
  }

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      {/* Kolom kiri */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card card-pad-lg">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: "var(--brand-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary-dark)",
                  flexShrink: 0
                }}
              >
                <Container style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                  <div className="h1" style={{ fontSize: 24 }}>
                    {trailer.kode_trailer}
                  </div>
                  <StatusBadge status={trailer.status} />
                  {!trailer.is_active && (
                    <span className="badge" style={{ fontSize: 10, height: 18 }}>
                      Nonaktif
                    </span>
                  )}
                </div>
                <div className="body-sm muted">
                  Unit trailer · {trailer.jenis_nama ?? "—"}
                  {trailer.tahun ? ` · ${trailer.tahun}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {/* Trailer terjual dikelola lewat menu Penjualan Unit & Unit Trailer. */}
              {canManageOperational && trailer.status !== "terjual" && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
                  <Pencil style={{ width: 14, height: 14 }} />
                  Edit
                </button>
              )}
            </div>
          </div>

          <div className="divider" style={{ marginBottom: 14 }} />
          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 16 }}>
            <DetailField label="Jenis unit trailer" value={trailer.jenis_nama ?? "—"} />
            <DetailField label="Untuk jenis unit" value={trailer.jenis_unit_nama ?? "—"} />
            <DetailField label="Tahun" value={trailer.tahun ? String(trailer.tahun) : "—"} />
            <DetailField label="Kapasitas muatan" value={formatKapasitas(trailer.kapasitas_ton)} />
            <DetailField label="Total job" value={`${jobs.length}`} />
            <DetailField label="Status saat ini" valueNode={<StatusBadge status={trailer.status} />} />
          </div>
        </div>

        <div className="card">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={[
              { key: "aktif", label: "Job aktif", count: activeJob ? 1 : 0 },
              { key: "riwayat", label: "Riwayat job", count: pastJobs.length },
              { key: "history", label: "Riwayat status", count: history.length },
              { key: "insiden", label: "Insiden", count: hitungInsiden(incidents) },
              { key: "perbaikan", label: "Perintah Kerja Perbaikan" }
            ]}
          />
          <div>
            {tab === "aktif" && <JobAktifTab activeJob={activeJob} labelAset="unit trailer" />}
            {tab === "riwayat" && <RiwayatJobTab pastJobs={pastJobs} labelAset="unit trailer" />}
            {tab === "history" && <RiwayatStatusTab history={history} />}
            {tab === "perbaikan" && <TabPerbaikan aset={{ unit_trailer_id: trailer.id }} />}
            {tab === "insiden" && (
              <InsidenPanel
                aset={{ unit_trailer_id: trailer.id }}
                kode={trailer.kode_trailer}
                labelAset="unit trailer"
                status={trailer.status}
                incidents={incidents}
                activeJobs={jobs.filter(isJobAktif)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Kolom kanan */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DokumenCard
          kosong="Belum dicatat — isi lewat Edit unit trailer"
          items={[
            { label: "KIR", tanggal: trailer.kir_berlaku_sampai, nomor: trailer.kir_nomor, url: trailer.kir_url },
            {
              label: "SRUT",
              tanggal: trailer.srut_tanggal,
              nomor: trailer.srut_nomor,
              berlaku: false,
              url: trailer.srut_url
            }
          ]}
        />
        <KartuAsuransi aset={{ unit_trailer_id: trailer.id }} polis={trailer.polis_terkini} />
        <UtilisasiCard utilisasi={utilisasi} />
        {canManageOperational && trailer.status !== "terjual" && (
          <div className="card card-pad">
            <div className="h3" style={{ marginBottom: 4 }}>
              Aksi
            </div>
            <div className="caption" style={{ marginBottom: 12 }}>
              Untuk mengeluarkan trailer dari armada, pakai menu Penghapusan Unit &amp; Unit Trailer.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <HapusAtauNonaktifkan
                jenis="unit_trailer"
                id={trailer.id}
                kode={trailer.kode_trailer}
                isActive={trailer.is_active}
              />
            </div>
          </div>
        )}
      </div>

      <UnitTrailerFormModal
        open={editOpen}
        trailer={trailer}
        jenisList={jenisList}
        jenisUnitList={jenisUnit.data ?? []}
        busy={busy !== null}
        onClose={() => setEditOpen(false)}
        onSave={simpan}
        onCreateJenis={tambahJenis}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}
