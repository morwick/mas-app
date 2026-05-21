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
  void cancelled; // kept for API compat — cancelled state is shown via separate banner

  if (orientation === "vertical") {
    return (
      <ol className={cn("flex flex-col", className)}>
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const isLast = i === steps.length - 1;
          return (
            <li
              key={step.key}
              className="flex gap-3"
              style={{ paddingBottom: isLast ? 0 : 14 }}
            >
              <div
                className="flex flex-col items-center"
                style={{ position: "relative" }}
              >
                <div
                  className={cn(
                    "stepper-dot",
                    done && "done",
                    active && "active"
                  )}
                >
                  {done ? <Check style={{ width: 14, height: 14 }} /> : i + 1}
                </div>
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      width: 1.5,
                      marginTop: 4,
                      background: done
                        ? "var(--brand-primary)"
                        : "var(--border-default)"
                    }}
                  />
                )}
              </div>
              <div style={{ paddingBottom: 8, flex: 1 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active
                      ? "var(--brand-primary-dark)"
                      : done
                        ? "var(--text-primary)"
                        : "var(--text-tertiary)"
                  }}
                >
                  {step.label}
                </p>
                {step.hint && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 2
                    }}
                  >
                    {step.hint}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className={cn("stepper", className)}>
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.key} className="stepper-step">
            <div
              className={cn(
                "stepper-dot",
                done && "done",
                active && "active"
              )}
            >
              {done ? <Check style={{ width: 14, height: 14 }} /> : i + 1}
              {i < steps.length - 1 && (
                <div className={cn("stepper-connector", done && "done")} />
              )}
            </div>
            <div className={cn("stepper-label", active && "active")}>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
