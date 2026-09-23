import { Stepper } from "@/components/ui/stepper";
import { CUSTOMER_STEPS, customerStep } from "@/lib/job-status";
import { jobStatusOrder } from "@/types";
import type { JobStatus } from "@/types";

interface JobStepperProps {
  status: JobStatus;
  orientation?: "horizontal" | "vertical";
  /** Tampilan pelanggan: tahap internal (pool, validasi) disembunyikan. */
  audience?: "internal" | "customer";
}

export function JobStepper({ status, orientation = "horizontal", audience = "internal" }: JobStepperProps) {
  if (status === "cancelled") {
    return (
      <div className="rounded-md bg-status-cancelled-bg text-status-cancelled-fg px-3 py-2 text-[13px] font-medium">
        Pengiriman dibatalkan
      </div>
    );
  }
  const steps = audience === "customer" ? CUSTOMER_STEPS : jobStatusOrder;
  const current = audience === "customer" ? customerStep(status) : status === "menunggu_pickup" ? "ditugaskan" : status;
  return (
    <Stepper
      orientation={orientation}
      steps={steps.map((s) => ({ key: s.key, label: s.label }))}
      currentKey={current}
    />
  );
}
