"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  Battery,
  Check,
  ChevronDown,
  LayoutDashboard,
  Lock,
  Signal,
  Smartphone,
  Wifi,
  X
} from "lucide-react";

type AdminScreen = {
  k: string;
  l: string;
  needs?: "unit" | "job";
  urlFn: (ids: ProtoIds) => string;
};

type CustomerScreen = {
  k: string;
  l: string;
  urlFn: (ids: ProtoIds) => string;
};

type ProtoIds = { unitId: string; jobId: string; token: string };

type Tweaks = {
  showBoth: "both" | "admin" | "customer";
  showLabels: boolean;
};

const ADMIN_SCREENS: AdminScreen[] = [
  { k: "login", l: "Login", urlFn: () => "/login" },
  { k: "dashboard", l: "Dashboard", urlFn: () => "/dashboard" },
  { k: "units", l: "Daftar Unit", urlFn: () => "/units" },
  {
    k: "unitDetail",
    l: "Detail Unit",
    needs: "unit",
    urlFn: (ids) => `/units/${ids.unitId || "preview"}`
  },
  { k: "jobs", l: "Daftar Job", urlFn: () => "/jobs" },
  { k: "jobNew", l: "Form Job Baru", urlFn: () => "/jobs/new" },
  {
    k: "jobConfirm",
    l: "Konfirmasi Job",
    needs: "job",
    urlFn: (ids) => `/jobs/${ids.jobId || "preview"}/confirmation`
  },
  {
    k: "jobDetail",
    l: "Detail Job",
    needs: "job",
    urlFn: (ids) => `/jobs/${ids.jobId || "preview"}`
  },
  { k: "drivers", l: "Driver", urlFn: () => "/drivers" },
  { k: "customers", l: "Customer", urlFn: () => "/customers" },
  { k: "reports", l: "Laporan", urlFn: () => "/reports" },
  { k: "settings", l: "Pengaturan", urlFn: () => "/settings" }
];

const CUSTOMER_SCREENS: CustomerScreen[] = [
  {
    k: "trackPage",
    l: "Tracking aktif",
    urlFn: (ids) => `/track/${ids.token || "preview"}`
  },
  {
    k: "expired",
    l: "Link expired",
    urlFn: (ids) => `/track/${ids.token || "preview"}/expired`
  }
];

export function ProtoShell() {
  const [adminScreen, setAdminScreen] = useState("dashboard");
  const [customerScreen, setCustomerScreen] = useState("trackPage");
  const [ids, setIds] = useState<ProtoIds>({
    unitId: "",
    jobId: "",
    token: ""
  });
  const [tweaks, setTweaks] = useState<Tweaks>({
    showBoth: "both",
    showLabels: true
  });

  const adminDef = ADMIN_SCREENS.find((s) => s.k === adminScreen) ?? ADMIN_SCREENS[0];
  const customerDef =
    CUSTOMER_SCREENS.find((s) => s.k === customerScreen) ?? CUSTOMER_SCREENS[0];

  const adminUrl = adminDef.urlFn(ids);
  const customerUrl = customerDef.urlFn(ids);

  const showAdmin = tweaks.showBoth === "both" || tweaks.showBoth === "admin";
  const showCustomer =
    tweaks.showBoth === "both" || tweaks.showBoth === "customer";

  const adminNeedsId = adminDef.needs;
  const adminMissingId =
    (adminNeedsId === "unit" && !ids.unitId) ||
    (adminNeedsId === "job" && !ids.jobId);
  const customerMissingId =
    customerScreen.startsWith("track") || customerScreen === "expired"
      ? !ids.token
      : false;

  return (
    <div style={{ minHeight: "100vh" }}>
      <ProtoToolbar
        adminScreen={adminScreen}
        onAdminScreenChange={setAdminScreen}
        customerScreen={customerScreen}
        onCustomerScreenChange={setCustomerScreen}
        ids={ids}
        onIdsChange={setIds}
        showAdmin={showAdmin}
        showCustomer={showCustomer}
      />

      <div
        style={{
          display: "flex",
          gap: 36,
          padding: "32px 36px 96px",
          alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content"
        }}
      >
        {showAdmin && (
          <FrameWrapper
            label="Admin · Desktop"
            sublabel={adminDef.l}
            url={"mas.co.id" + adminUrl}
            showLabels={tweaks.showLabels}
          >
            <DesktopFrame url={adminUrl}>
              {adminMissingId ? (
                <MissingIdPlaceholder
                  kind={adminNeedsId === "unit" ? "unit" : "job"}
                />
              ) : (
                <iframe
                  key={adminUrl}
                  src={adminUrl}
                  title="Admin desktop"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "#F5F5F0"
                  }}
                />
              )}
            </DesktopFrame>
          </FrameWrapper>
        )}

        {showCustomer && (
          <FrameWrapper
            label="Customer · Mobile"
            sublabel={customerDef.l}
            url={
              "mas.co.id/track/" +
              (ids.token ? ids.token.slice(0, 10) + "…" : "[token]")
            }
            showLabels={tweaks.showLabels}
          >
            <PhoneFrame>
              {customerMissingId ? (
                <MissingIdPlaceholder kind="token" />
              ) : (
                <iframe
                  key={customerUrl}
                  src={customerUrl}
                  title="Customer mobile"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "#F5F5F0"
                  }}
                />
              )}
            </PhoneFrame>
          </FrameWrapper>
        )}
      </div>

      <TweaksPanel tweaks={tweaks} onChange={setTweaks} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function ProtoToolbar({
  adminScreen,
  onAdminScreenChange,
  customerScreen,
  onCustomerScreenChange,
  ids,
  onIdsChange,
  showAdmin,
  showCustomer
}: {
  adminScreen: string;
  onAdminScreenChange: (s: string) => void;
  customerScreen: string;
  onCustomerScreenChange: (s: string) => void;
  ids: ProtoIds;
  onIdsChange: (ids: ProtoIds) => void;
  showAdmin: boolean;
  showCustomer: boolean;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(0,0,0,0.1)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <MasMark />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1A1A17"
            }}
          >
            Mitra Angkutan Sejati
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#8A8983",
              marginTop: 2
            }}
          >
            Interactive prototype · v1
          </span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <IdInput
        label="Unit ID"
        value={ids.unitId}
        onChange={(v) => onIdsChange({ ...ids, unitId: v })}
        placeholder="u-1"
      />
      <IdInput
        label="Job ID"
        value={ids.jobId}
        onChange={(v) => onIdsChange({ ...ids, jobId: v })}
        placeholder="j-1"
      />
      <IdInput
        label="Token"
        value={ids.token}
        onChange={(v) => onIdsChange({ ...ids, token: v })}
        placeholder="share_token"
        width={150}
      />

      {showAdmin && (
        <ScreenPicker
          icon={<LayoutDashboard size={13} />}
          label="Admin"
          value={adminScreen}
          onChange={onAdminScreenChange}
          options={ADMIN_SCREENS}
        />
      )}
      {showCustomer && (
        <ScreenPicker
          icon={<Smartphone size={13} />}
          label="Customer"
          value={customerScreen}
          onChange={onCustomerScreenChange}
          options={CUSTOMER_SCREENS}
        />
      )}
    </div>
  );
}

function MasMark() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        background: "#1C9600",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: 700,
        fontSize: 12.5,
        letterSpacing: "-0.02em",
        position: "relative"
      }}
    >
      MAS
      <span
        style={{
          position: "absolute",
          inset: 1.5,
          borderRadius: 5.5,
          border: "1px solid rgba(255,255,255,0.22)",
          pointerEvents: "none"
        }}
      />
    </div>
  );
}

function IdInput({
  label,
  value,
  onChange,
  placeholder,
  width = 110
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width?: number;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 10,
        color: "#8A8983",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5
      }}
    >
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width,
          height: 28,
          padding: "0 10px",
          border: "0.5px solid rgba(0,0,0,0.18)",
          borderRadius: 6,
          fontSize: 12.5,
          fontWeight: 500,
          background: "white",
          color: "#1A1A17",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          textTransform: "none",
          letterSpacing: 0,
          outline: "none"
        }}
        onFocus={(e) => (e.target.style.borderColor = "#1C9600")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.18)")}
      />
    </label>
  );
}

function ScreenPicker<
  T extends { k: string; l: string }
>({
  icon,
  label,
  value,
  onChange,
  options
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (k: string) => void;
  options: T[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const current = options.find((o) => o.k === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px 6px 10px",
          borderRadius: 8,
          background: "white",
          border: "0.5px solid rgba(0,0,0,0.18)",
          fontSize: 13,
          fontWeight: 500,
          minWidth: 200,
          cursor: "pointer"
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "#F1EFE8",
            color: "#5F5E5A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div
            style={{
              fontSize: 10,
              color: "#8A8983",
              lineHeight: 1,
              marginBottom: 3,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1 }}>
            {current?.l ?? "—"}
          </div>
        </div>
        <ChevronDown size={14} color="#5F5E5A" />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 240,
            background: "white",
            border: "0.5px solid rgba(0,0,0,0.18)",
            borderRadius: 10,
            padding: 4,
            zIndex: 200,
            boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
            maxHeight: 380,
            overflow: "auto"
          }}
        >
          {options.map((o) => {
            const active = o.k === value;
            return (
              <button
                key={o.k}
                type="button"
                onClick={() => {
                  onChange(o.k);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: 6,
                  background: active ? "#E8F7E0" : "transparent",
                  color: active ? "#145B00" : "#1A1A17",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  textAlign: "left",
                  cursor: "pointer"
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#FAFAF6";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {active && <Check size={13} />}
                <span style={{ flex: 1 }}>{o.l}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Device frames                                                       */
/* ------------------------------------------------------------------ */

function DesktopFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: 1280,
        borderRadius: 14,
        background: "#2A2A26",
        padding: 10,
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08)",
        flexShrink: 0
      }}
    >
      <div
        style={{
          height: 26,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 6
        }}
      >
        <TrafficLight color="#FF5F57" />
        <TrafficLight color="#FEBC2E" />
        <TrafficLight color="#28C840" />
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            color: "#A8A8A0",
            fontSize: 11.5
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 14px",
              background: "#1A1A17",
              borderRadius: 6,
              fontFamily: "JetBrains Mono, ui-monospace, monospace"
            }}
          >
            <Lock size={10} />
            mas.co.id{url}
          </div>
        </div>
      </div>
      <div
        style={{
          background: "#F5F5F0",
          borderRadius: 6,
          overflow: "hidden",
          height: 800,
          position: "relative"
        }}
      >
        {children}
      </div>
    </div>
  );
}

function TrafficLight({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 11,
        height: 11,
        borderRadius: 99,
        background: color,
        display: "inline-block"
      }}
    />
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 390,
        height: 800,
        borderRadius: 44,
        background: "#1A1A17",
        padding: 12,
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08)",
        position: "relative",
        flexShrink: 0
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          width: 90,
          height: 26,
          background: "#1A1A17",
          borderRadius: 99,
          zIndex: 100
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 32,
          background: "#F5F5F0",
          overflow: "hidden",
          position: "relative"
        }}
      >
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 28px 8px",
            fontSize: 14,
            fontWeight: 600,
            color: "#1A1A17",
            background: "#F5F5F0",
            position: "relative",
            zIndex: 50
          }}
        >
          <span style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            9:41
          </span>
          <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <Signal size={14} />
            <Wifi size={14} />
            <Battery size={18} />
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: "hidden"
          }}
        >
          {children}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 130,
            height: 4,
            background: "#1A1A17",
            borderRadius: 99,
            opacity: 0.85,
            zIndex: 100
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frame label + placeholders                                          */
/* ------------------------------------------------------------------ */

function FrameWrapper({
  label,
  sublabel,
  url,
  children,
  showLabels
}: {
  label: string;
  sublabel: string;
  url: string;
  children: ReactNode;
  showLabels: boolean;
}) {
  if (!showLabels) return <>{children}</>;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#1A1A17"
            }}
          >
            {label}
          </span>
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: 99,
              background: "#8A8983"
            }}
          />
          <span style={{ fontSize: 11, color: "#5F5E5A", fontWeight: 500 }}>
            {sublabel}
          </span>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "#8A8983",
            fontFamily: "JetBrains Mono, ui-monospace, monospace"
          }}
        >
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

function MissingIdPlaceholder({ kind }: { kind: "unit" | "job" | "token" }) {
  const map = {
    unit: { label: "Unit ID", hint: "Isi Unit ID di toolbar (mis. u-1)" },
    job: { label: "Job ID", hint: "Isi Job ID di toolbar (mis. j-1)" },
    token: {
      label: "Share token",
      hint: "Isi share token di toolbar untuk membuka tracking page"
    }
  } as const;
  const { label, hint } = map[kind];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
        color: "#5F5E5A"
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 99,
          background: "#F1EFE8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1C9600",
          fontSize: 18,
          fontWeight: 700
        }}
      >
        ?
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A17" }}>
        {label} belum diisi
      </div>
      <div style={{ fontSize: 12.5, maxWidth: 280, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tweaks panel                                                        */
/* ------------------------------------------------------------------ */

function TweaksPanel({
  tweaks,
  onChange
}: {
  tweaks: Tweaks;
  onChange: (t: Tweaks) => void;
}) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          height: 32,
          padding: "0 14px",
          borderRadius: 16,
          background: "rgba(26,26,23,0.85)",
          color: "white",
          border: 0,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)"
        }}
      >
        Tweaks
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483646,
        width: 280,
        background: "rgba(250,249,247,0.85)",
        color: "#29261b",
        border: "0.5px solid rgba(255,255,255,0.6)",
        borderRadius: 14,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 40px rgba(0,0,0,0.18)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        fontSize: 11.5,
        overflow: "hidden"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 8px 10px 14px"
        }}
      >
        <strong
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.01em" }}
        >
          Tweaks
        </strong>
        <button
          type="button"
          aria-label="Close tweaks"
          onClick={() => setOpen(false)}
          style={{
            appearance: "none",
            border: 0,
            background: "transparent",
            color: "rgba(41,38,27,0.55)",
            width: 22,
            height: 22,
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <X size={13} />
        </button>
      </div>
      <div
        style={{
          padding: "2px 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <TweakSection title="Layout">
          <SegmentedControl
            label="Tampilkan"
            value={tweaks.showBoth}
            options={[
              { value: "both", label: "Keduanya" },
              { value: "admin", label: "Admin" },
              { value: "customer", label: "Mobile" }
            ]}
            onChange={(v) =>
              onChange({ ...tweaks, showBoth: v as Tweaks["showBoth"] })
            }
          />
        </TweakSection>
        <TweakSection title="Display">
          <ToggleRow
            label="Label frame"
            value={tweaks.showLabels}
            onChange={(v) => onChange({ ...tweaks, showLabels: v })}
          />
        </TweakSection>
      </div>
    </div>
  );
}

function TweakSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(41,38,27,0.45)"
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const idx = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [options, value]
  );
  const n = options.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: "rgba(41,38,27,0.72)", fontWeight: 500 }}>
        {label}
      </span>
      <div
        style={{
          position: "relative",
          display: "flex",
          padding: 2,
          borderRadius: 8,
          background: "rgba(0,0,0,0.06)"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
            background: "rgba(255,255,255,0.9)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
            borderRadius: 6,
            transition: "left 0.15s cubic-bezier(0.3,0.7,0.4,1)"
          }}
        />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              border: 0,
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontWeight: 500,
              minHeight: 22,
              borderRadius: 6,
              cursor: "pointer",
              padding: "4px 6px",
              lineHeight: 1.2
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10
      }}
    >
      <span style={{ color: "rgba(41,38,27,0.72)", fontWeight: 500 }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          position: "relative",
          width: 32,
          height: 18,
          border: 0,
          borderRadius: 999,
          background: value ? "#34c759" : "rgba(0,0,0,0.15)",
          transition: "background 0.15s",
          cursor: "pointer",
          padding: 0
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            transition: "transform 0.15s",
            transform: value ? "translateX(14px)" : "translateX(0)"
          }}
        />
      </button>
    </div>
  );
}
