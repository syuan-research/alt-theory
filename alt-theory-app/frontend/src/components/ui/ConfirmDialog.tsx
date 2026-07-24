import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  checkbox?: { label: string; defaultChecked?: boolean; danger?: boolean };
  onConfirm: (result?: { checkboxChecked: boolean }) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  checkbox,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [checked, setChecked] = useState(checkbox?.defaultChecked ?? false);

  // Reset to the request's default each time the dialog (re)opens.
  useEffect(() => {
    if (open) setChecked(checkbox?.defaultChecked ?? false);
  }, [open, checkbox?.defaultChecked]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
        className={cn(
          "w-full max-w-md rounded-lg border border-hairline bg-surface p-4 shadow-lg"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <p id="confirm-dialog-message" className="text-[0.9375rem] text-ink">
          {message}
        </p>
        {checkbox ? (
          <label
            className={cn(
              "mt-3 flex items-center gap-2 text-[0.875rem] cursor-pointer",
              checkbox.danger ? "text-danger" : "text-ink"
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {checkbox.label}
          </label>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm({ checkboxChecked: checked })}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
