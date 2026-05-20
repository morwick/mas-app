import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperItem {
  key: string;
  label: string;
  hint?: string;
}

interface StepperProps {
  steps: StepperItem[];
  currentKey: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
  cancelled?: boolean;
}

export function Stepper({
  steps,
  currentKey,
  className,
  orientation = "horizontal",
  cancelled
}: StepperProps) {
  const currentIdx = steps.findIndex((s) => s.key === currentKey);

  if (orientation === "vertical") {
    return (
      <ol className={cn("flex flex-col gap-0", className)}>
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium border",
                    done && "bg-brand border-brand text-white",
                    active && !cancelled && "bg-white border-brand text-brand",
                    !done && !active && "bg-white border-border text-text-muted",
                    cancelled && active && "bg-status-cancelled-bg border-danger text-status-cancelled-fg"
                  )}
                >
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-px flex-1 my-1",
                      done ? "bg-brand" : "bg-border"
                    )}
                  />
                )}
              </div>
              <div className="pb-5">
                <p
                  className={cn(
                    "text-[13px] font-medium",
                    active ? "text-brand-dark" : "text-text",
                    !done && !active && "text-text-muted"
                  )}
                >
                  {step.label}
                </p>
                {step.hint && (
                  <p className="text-[11px] text-text-muted mt-0.5">{step.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn("flex items-start gap-0 w-full", className)}>
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={step.key} className="flex-1 flex flex-col items-center min-w-0">
            <div className="w-full flex items-center">
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "bg-transparent" : done || active ? "bg-brand" : "bg-border"
                )}
              />
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium border shrink-0",
                  done && "bg-brand border-brand text-white",
                  active && !cancelled && "bg-white border-brand text-brand",
                  !done && !active && "bg-white border-border text-text-muted",
                  cancelled && active && "bg-status-cancelled-bg border-danger text-status-cancelled-fg"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <div
                className={cn(
                  "h-0.5 flex-1",
                  i === steps.length - 1 ? "bg-transparent" : done ? "bg-brand" : "bg-border"
                )}
              />
            </div>
            <p
              className={cn(
                "mt-2 text-[11px] text-center leading-tight px-1",
                active ? "text-brand-dark font-medium" : "text-text-muted",
                done && "text-text"
              )}
            >
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
