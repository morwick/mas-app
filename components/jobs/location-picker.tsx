"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { MapPin, Pencil, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/input";

/**
 * Wrapper LocationPicker: textarea alamat + tombol "Pin di peta".
 * Modal map lazy-loaded via next/dynamic (ssr:false) untuk hindari
 * Leaflet error di SSR.
 */

const PickerMap = dynamic(
  () => import("./location-picker-map").then((m) => m.LocationPickerMap),
  { ssr: false }
);

export interface LocationValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

export interface LocationPickerExtraAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface Props {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  placeholder?: string;
  error?: string;
  extraAction?: LocationPickerExtraAction;
}

export function LocationPicker({
  value,
  onChange,
  placeholder,
  error,
  extraAction
}: Props) {
  const [open, setOpen] = useState(false);
  const hasPin = value.lat !== null && value.lng !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Textarea
        rows={2}
        placeholder={placeholder ?? "Alamat lengkap"}
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        error={error}
      />
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen(true)}
          style={{ fontSize: 12 }}
        >
          {hasPin ? (
            <>
              <Pencil style={{ width: 12, height: 12 }} />
              Ubah pin di peta
            </>
          ) : (
            <>
              <MapPin style={{ width: 12, height: 12 }} />
              Pin lokasi di peta
            </>
          )}
        </button>
        {extraAction && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => extraAction.onClick()}
            disabled={extraAction.disabled || extraAction.loading}
            title={extraAction.hint}
            style={{ fontSize: 12 }}
          >
            {extraAction.loading ? (
              <Loader2
                style={{
                  width: 12,
                  height: 12,
                  animation: "spin 0.8s linear infinite"
                }}
              />
            ) : (
              extraAction.icon
            )}
            {extraAction.label}
          </button>
        )}
        {hasPin && value.lat !== null && value.lng !== null && (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono, monospace)"
            }}
          >
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 800,
              height: "min(640px, 90vh)",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <PickerMap
              initialLat={value.lat}
              initialLng={value.lng}
              initialAddress={value.address}
              onConfirm={(data) => {
                onChange({
                  address: data.address || value.address,
                  lat: data.lat,
                  lng: data.lng
                });
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
