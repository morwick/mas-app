import { AlertTriangle } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmText = "Konfirmasi",
  cancelText = "Batal",
  variant = "danger",
  loading
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-[420px]"
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-status-cancelled-bg flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-status-cancelled-fg" />
        </div>
        <div>
          <h3 className="text-[16px] font-medium text-text">{title}</h3>
          {body && <div className="mt-1 text-[13px] text-text-muted">{body}</div>}
        </div>
      </div>
    </Modal>
  );
}
