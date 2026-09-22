import { api } from "@/lib/api/client";
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
}

/** Lokasi semua unit aktif ber-IMEI (admin). */
export const fleetLocations = () => api.get<FleetLocations>("/tracking/units/locations");

export const unitLocation = (unitId: string) =>
  api.get<LocationEntry>(`/tracking/units/${unitId}/location`);

/** Halaman pelanggan — tanpa login. */
export const publicTracking = (token: string) =>
  api.get<PublicTracking>(`/track/${token}`, undefined, "none");

export const publicLocation = (token: string) =>
  api.get<LocationEntry>(`/track/${token}/location`, undefined, "none");
