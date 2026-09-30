import { api } from "@/lib/api/client";
import { jagaSesiTrackSolid } from "@/lib/tracksolid-captcha";
import type { Job, LocationEntry } from "@/types";

export interface FleetLocations {
  locations: Record<string, LocationEntry | null>;
}

export interface PublicTracking {
  job: Job;
  unit: {
    kode_unit: string;
    no_polisi: string;
    jenis: string;
    tracksolid_share_link: string | null;
  } | null;
  driver: { nama: string; no_hp: string } | null;
  /**
   * Bagi customer job selesai begitu driver menuntaskan unloading (4 foto sisi
   * kendaraan + surat jalan) — status internal sesudahnya tidak ditampilkan.
   */
  selesai: boolean;
  /** Batas link bisa dibuka (ISO): unloading tuntas + 24 jam. Null = belum selesai. */
  berlaku_sampai: string | null;
}

/** Lokasi semua unit aktif ber-IMEI (admin). */
// Memanggil TrackSolid di backend → tidak dikirim selama sesi butuh captcha.
export const fleetLocations = () =>
  jagaSesiTrackSolid(() => api.get<FleetLocations>("/tracking/units/locations"));

export const unitLocation = (unitId: string) =>
  jagaSesiTrackSolid(() => api.get<LocationEntry>(`/tracking/units/${unitId}/location`));

/** Halaman pelanggan — tanpa login. */
export const publicTracking = (token: string) =>
  api.get<PublicTracking>(`/track/${token}`, undefined, "none");

export const publicLocation = (token: string) =>
  api.get<LocationEntry>(`/track/${token}/location`, undefined, "none");

/** Gambar kode verifikasi lokasi (customer) — hanya saat lokasi butuh verifikasi. */
export const publicVerifikasi = (token: string) =>
  api.post<{ id: string; gambar: string }>(`/track/${token}/verifikasi`, undefined, "none");

/** Kode benar → lokasi unit langsung dikembalikan. */
export const publicVerifikasiKirim = (token: string, id: string, kode: string) =>
  api.post<LocationEntry>(`/track/${token}/verifikasi/kirim`, { id, kode }, "none");
