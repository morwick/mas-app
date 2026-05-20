import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
  className?: string;
}

const sizes = {
  sm: { box: "w-8 h-8 text-[12px]", text: "text-[14px]", tagline: "text-[10px]" },
  md: { box: "w-10 h-10 text-[14px]", text: "text-[16px]", tagline: "text-[11px]" },
  lg: { box: "w-16 h-16 text-[20px]", text: "text-[22px]", tagline: "text-[12px]" }
};

export function Logo({ size = "md", withTagline, className }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "rounded-md bg-brand text-white flex items-center justify-center font-semibold tracking-tight",
          s.box
        )}
      >
        MAS
      </div>
      <div className="flex flex-col leading-tight">
        <span className={cn("font-semibold text-text", s.text)}>
          Mitra Angkutan Sejati
        </span>
        {withTagline && (
          <span className={cn("text-text-muted", s.tagline)}>
            Manajemen armada & tracking
          </span>
        )}
      </div>
    </div>
  );
}
