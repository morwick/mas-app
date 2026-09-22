import type { ServiceStatus, UnitServiceInfo } from "@/types";

export const DEFAULT_SERVICE_INTERVAL_KM = 10000;
export const WARNING_THRESHOLD_KM = 500;

export interface DerivedServiceStatus {
  status: ServiceStatus;
  next_service_at_km: number;
  km_to_next_service: number;
  km_since_last_service: number;
  progress_percent: number;
}

export function deriveServiceStatus(
  info: UnitServiceInfo
): DerivedServiceStatus {
  const baseline = info.last_service_odometer_km ?? 0;
  const next = baseline + info.service_interval_km;
  const km_to_next_service = next - info.current_odometer_km;
  const km_since_last_service = Math.max(
    0,
    info.current_odometer_km - baseline
  );
  const progress_percent = Math.min(
    100,
    Math.max(0, (km_since_last_service / info.service_interval_km) * 100)
  );
  const status: ServiceStatus =
    km_to_next_service <= 0
      ? "overdue"
      : km_to_next_service <= WARNING_THRESHOLD_KM
        ? "mendekati"
        : "ok";
  return {
    status,
    next_service_at_km: next,
    km_to_next_service,
    km_since_last_service,
    progress_percent
  };
}

export function formatKm(km: number): string {
  return `${new Intl.NumberFormat("id-ID").format(Math.round(km))} km`;
}
