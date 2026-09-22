import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Tidak dipakai lagi sejak logo PNG sudah berisi tagline. Disisakan untuk backward compat. */
  showSub?: boolean;
  className?: string;
}

const heightMap = { sm: 24, md: 36, lg: 48 } as const;
const LOGO_RATIO = 6; // ~600x100 native, lebar:tinggi ~6:1

export function Logo({ size = "md", className }: LogoProps) {
  const h = heightMap[size];
  const w = Math.round(h * LOGO_RATIO);
  return (
    <div
      className={cn("inline-flex items-center", className)}
      style={{ height: h }}
    >
      <img
        src="/logo.png"
        alt="MAS Group — Heavy Equipment & Truck"
        width={w}
        height={h}
        style={{ width: "auto", height: h, display: "block" }}
      />
    </div>
  );
}
