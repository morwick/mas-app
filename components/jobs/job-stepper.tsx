import { Stepper } from "@/components/ui/stepper";
import { jobStatusOrder } from "@/lib/types";
import type { JobStatus } from "@/lib/types";

interface JobStepperProps {
  status: JobStatus;
  orientation?: "horizontal" | "vertical";
}

export function JobStepper({ status, orientation = "horizontal" }: JobStepperProps) {
  if (status === "cancelled") {
    return (
      <div className="rounded-md bg-status-cancelled-bg text-status-cancelled-fg px-3 py-2 text-[13px] font-medium">
        Pengiriman dibatalkan
      </div>
    );
  }
  return (
    <Stepper
      orientation={orientation}
      steps={jobStatusOrder.map((s) => ({ key: s.key, label: s.label }))}
      currentKey={status}
    />
  );
}
