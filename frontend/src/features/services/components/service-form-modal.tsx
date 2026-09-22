import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createService, mileageAt } from "@/features/services/api";
import {
  jenisServiceLabel,
  type JenisService
} from "@/types";
import { formatKm } from "@/lib/service";
import { formatDate } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitKode: string;
  currentOdometerKm: number;
  serviceIntervalKm: number;
}

interface LookupState {
  loading: boolean;
  source: "today" | "history" | "manual" | null;
  akumulasiKm: number | null;
  kmAfterTarget: number | null;
  dataQuality: "complete" | "partial" | "no_data" | null;
  missingDays: string[];
  error: string | null;
}

const INITIAL_LOOKUP: LookupState = {
  loading: false,
  source: null,
  akumulasiKm: null,
  kmAfterTarget: null,
  dataQuality: null,
  missingDays: [],
  error: null
};

const jenisOptions: JenisService[] = ["rutin", "oli", "ban", "mesin", "lainnya"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ServiceFormModal({
  open,
  onClose,
  unitId,
  unitKode,
  currentOdometerKm,
  serviceIntervalKm
}: Props) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tanggal: todayIso(),
    odometer_km: String(currentOdometerKm),
    jenis: "rutin" as JenisService,
    catatan: ""
  });
  const [error, setError] = useState<Record<string, string>>({});
  const [lookup, setLookup] = useState<LookupState>({
    ...INITIAL_LOOKUP,
    source: "today"
  });
  // Track apakah admin sudah edit kolom odometer secara manual — kalau iya,
  // jangan override saat lookup selesai.
  const manuallyEditedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setForm({
        tanggal: todayIso(),
        odometer_km: String(currentOdometerKm),
        jenis: "rutin",
        catatan: ""
      });
      setError({});
      setLookup({ ...INITIAL_LOOKUP, source: "today" });
      manuallyEditedRef.current = false;
    }
  }, [open, currentOdometerKm]);

  // Lookup akumulasi km saat tanggal berubah ke backdate.
  useEffect(() => {
    if (!open) return;
    const today = todayIso();
    if (form.tanggal === today) {
      // Reset ke pembacaan sekarang
      setLookup({ ...INITIAL_LOOKUP, source: "today" });
      if (!manuallyEditedRef.current) {
        setForm((f) => ({ ...f, odometer_km: String(currentOdometerKm) }));
      }
      return;
    }
    if (form.tanggal > today) {
      // Validasi di submit; di sini diam saja
      return;
    }

    let cancelled = false;
    setLookup((l) => ({ ...l, loading: true, error: null }));

    async function fetchLookup() {
      try {
        const body = await mileageAt(unitId, form.tanggal);
        if (cancelled) return;
        const next: LookupState = {
          loading: false,
          source: body.data_quality === "no_data" ? "manual" : "history",
          akumulasiKm: body.akumulasi_km,
          kmAfterTarget: body.km_after_target,
          dataQuality: body.data_quality,
          missingDays: body.missing_days,
          error: null
        };
        setLookup(next);
        if (
          next.akumulasiKm != null &&
          next.source === "history" &&
          !manuallyEditedRef.current
        ) {
          setForm((f) => ({
            ...f,
            odometer_km: String(next.akumulasiKm)
          }));
        }
      } catch (e) {
        if (cancelled) return;
        setLookup({
          ...INITIAL_LOOKUP,
          source: "manual",
          error: e instanceof Error ? e.message : "Gagal lookup"
        });
      }
    }

    fetchLookup();
    return () => {
      cancelled = true;
    };
  }, [open, form.tanggal, unitId, currentOdometerKm]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onOdometerChange(v: string) {
    manuallyEditedRef.current = true;
    set("odometer_km", v);
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.tanggal) errs.tanggal = "Tanggal wajib diisi";
    else if (form.tanggal > todayIso())
      errs.tanggal = "Tanggal tidak boleh di masa depan";

    const odoNum = Number(form.odometer_km);
    if (!form.odometer_km || Number.isNaN(odoNum) || odoNum < 0)
      errs.odometer_km = "Akumulasi km harus angka non-negatif";
    else if (odoNum > currentOdometerKm)
      errs.odometer_km = `Tidak boleh melebihi akumulasi sekarang (${formatKm(
        currentOdometerKm
      )})`;

    setError(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const res = await createService({
      unit_id: unitId,
      tanggal: form.tanggal,
      odometer_km: Math.round(odoNum),
      jenis: form.jenis,
      catatan: form.catatan.trim() || null
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Service berhasil dicatat");
    onClose();
  }

  const isBackdate = form.tanggal !== todayIso() && form.tanggal <= todayIso();
  const odoInput = Number(form.odometer_km);
  const validOdo = Number.isFinite(odoInput) && odoInput >= 0;
  const previewKmSince = validOdo
    ? Math.max(0, currentOdometerKm - odoInput)
    : null;
  const previewKmToNext =
    previewKmSince != null ? serviceIntervalKm - previewKmSince : null;
  const previewStatus =
    previewKmToNext == null
      ? null
      : previewKmToNext <= 0
        ? "overdue"
        : previewKmToNext <= 500
          ? "mendekati"
          : "ok";

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={`Catat service — ${unitKode}`}
      description="Setelah dicatat, counter sejak servis terakhir di-reset relatif terhadap akumulasi km saat servis."
      maxWidth="max-w-[560px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            Simpan service
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Jenis service" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {jenisOptions.map((j) => {
              const active = form.jenis === j;
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => set("jenis", j)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: "0.5px solid",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 120ms ease, border-color 120ms ease",
                    borderColor: active
                      ? "var(--brand-primary)"
                      : "var(--border-strong)",
                    background: active ? "var(--brand-primary-light)" : "white",
                    color: active
                      ? "var(--brand-primary-dark)"
                      : "var(--text-primary)"
                  }}
                >
                  {jenisServiceLabel[j]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal service" required>
            <Input
              type="date"
              value={form.tanggal}
              max={todayIso()}
              onChange={(e) => {
                manuallyEditedRef.current = false;
                set("tanggal", e.target.value);
              }}
              error={error.tanggal}
            />
          </Field>
          <Field
            label="Akumulasi KM saat servis"
            required
            hint={odometerHint(lookup, form.tanggal)}
          >
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={form.odometer_km}
              onChange={(e) => onOdometerChange(e.target.value)}
              error={error.odometer_km}
              rightAddon={
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    paddingRight: 8
                  }}
                >
                  km
                </span>
              }
            />
          </Field>
        </div>

        {isBackdate && (
          <BackdateBanner
            lookup={lookup}
            tanggal={form.tanggal}
            currentOdometerKm={currentOdometerKm}
            previewKmSince={previewKmSince}
            previewKmToNext={previewKmToNext}
            previewStatus={previewStatus}
            serviceIntervalKm={serviceIntervalKm}
          />
        )}

        <Field
          label="Catatan (opsional)"
          hint="Mis. ganti filter oli, ganti kampas rem, nama bengkel"
        >
          <Textarea
            rows={3}
            placeholder="Detail servis yang dilakukan"
            value={form.catatan}
            onChange={(e) => set("catatan", e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function odometerHint(lookup: LookupState, tanggal: string): string {
  if (lookup.loading) return "Mencari akumulasi km dari riwayat GPS…";
  if (lookup.source === "today") return "Auto-isi dari pembacaan sekarang.";
  if (lookup.source === "history") {
    if (lookup.dataQuality === "partial") {
      return `Dihitung dari riwayat GPS (ada ${lookup.missingDays.length} hari tanpa data, hasil bisa kurang akurat).`;
    }
    return `Dihitung otomatis dari riwayat GPS pada ${formatDate(tanggal)}.`;
  }
  if (lookup.source === "manual") {
    if (lookup.error) return `Lookup gagal: ${lookup.error}. Isi manual.`;
    return "Tidak ada data GPS pada tanggal ini. Isi manual dari catatan bengkel.";
  }
  return "";
}

interface BannerProps {
  lookup: LookupState;
  tanggal: string;
  currentOdometerKm: number;
  previewKmSince: number | null;
  previewKmToNext: number | null;
  previewStatus: "ok" | "mendekati" | "overdue" | null;
  serviceIntervalKm: number;
}

function BackdateBanner({
  lookup,
  tanggal,
  currentOdometerKm,
  previewKmSince,
  previewKmToNext,
  previewStatus,
  serviceIntervalKm
}: BannerProps) {
  const isNoData = lookup.dataQuality === "no_data";
  const isPartial = lookup.dataQuality === "partial";

  const bg = isNoData
    ? "#fef3f0"
    : isPartial
      ? "#fff8e6"
      : "var(--brand-primary-light)";
  const border = isNoData
    ? "#f5b8a8"
    : isPartial
      ? "#f0d68a"
      : "var(--brand-primary)";
  const Icon = isNoData || isPartial ? AlertTriangle : Info;
  const iconColor = isNoData
    ? "#a83a16"
    : isPartial
      ? "#8a5a00"
      : "var(--brand-primary-dark)";

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        border: `0.5px solid ${border}`,
        borderRadius: 8,
        background: bg
      }}
    >
      <Icon
        style={{
          width: 16,
          height: 16,
          color: iconColor,
          marginTop: 2,
          flexShrink: 0
        }}
      />
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Backdate service — {formatDate(tanggal)}
        </div>

        {lookup.loading && (
          <div style={{ color: "var(--text-secondary)" }}>
            Mencari akumulasi km dari riwayat GPS…
          </div>
        )}

        {!lookup.loading && isNoData && (
          <div style={{ color: "var(--text-secondary)" }}>
            Tidak ada data GPS untuk tanggal ini. Isi kolom <em>Akumulasi KM</em>{" "}
            manual sesuai pembacaan dashboard atau catatan bengkel saat itu.
          </div>
        )}

        {!lookup.loading && !isNoData && lookup.kmAfterTarget != null && (
          <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
            Antara {formatDate(tanggal)} sampai hari ini, unit sudah jalan{" "}
            <strong>{formatKm(lookup.kmAfterTarget)}</strong>. Km ini akan tetap
            dihitung sebagai pemakaian <em>setelah</em> servis.
          </div>
        )}

        {!lookup.loading &&
          previewKmSince != null &&
          previewKmToNext != null &&
          previewStatus && (
            <PreviewBox
              kmSince={previewKmSince}
              kmToNext={previewKmToNext}
              status={previewStatus}
              currentOdometerKm={currentOdometerKm}
              serviceIntervalKm={serviceIntervalKm}
            />
          )}
      </div>
    </div>
  );
}

function PreviewBox({
  kmSince,
  kmToNext,
  status,
  currentOdometerKm,
  serviceIntervalKm
}: {
  kmSince: number;
  kmToNext: number;
  status: "ok" | "mendekati" | "overdue";
  currentOdometerKm: number;
  serviceIntervalKm: number;
}) {
  const statusLabel =
    status === "overdue"
      ? `Overdue ${formatKm(Math.abs(kmToNext))}`
      : status === "mendekati"
        ? `Mendekati (sisa ${formatKm(kmToNext)})`
        : `OK (sisa ${formatKm(kmToNext)})`;
  const statusColor =
    status === "overdue"
      ? "#a83a16"
      : status === "mendekati"
        ? "#8a5a00"
        : "var(--brand-primary-dark)";

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        borderRadius: 6,
        border: "0.5px solid var(--border-default)",
        background: "white",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        fontSize: 12
      }}
    >
      <PreviewRow label="KM sejak servis" value={formatKm(kmSince)} />
      <PreviewRow
        label="Sisa menuju servis berikut"
        value={
          status === "overdue"
            ? `Lewat ${formatKm(Math.abs(kmToNext))}`
            : formatKm(kmToNext)
        }
      />
      <PreviewRow
        label="Akumulasi sekarang"
        value={formatKm(currentOdometerKm)}
      />
      <PreviewRow
        label="Status setelah simpan"
        value={statusLabel}
        valueColor={statusColor}
      />
      <div
        style={{
          gridColumn: "1 / -1",
          fontSize: 10.5,
          color: "var(--text-tertiary)",
          marginTop: 2
        }}
      >
        Interval servis {formatKm(serviceIntervalKm)}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  valueColor
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginBottom: 2
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}
