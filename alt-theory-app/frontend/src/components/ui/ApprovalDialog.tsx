import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ApprovalRequestPayload } from "@/api/types";

interface ApprovalDialogProps {
  request: ApprovalRequestPayload | null;
  onRespond: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => void;
}

/**
 * Extension approval dialog (spec §5.2). Shows the operation an extension is
 * asking about; the user can reject or allow it. Policy checks and approvals
 * are guard rails, not a sandbox — wording stays factual.
 */
export function ApprovalDialog({ request, onRespond }: ApprovalDialogProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [request?.approvalId]);

  if (!request) return null;

  const deny = () =>
    onRespond(request.approvalId, {
      accept: false,
      choice: null,
      text: null,
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      role="presentation"
      onClick={deny}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="approval-dialog-title"
        className="w-full max-w-md rounded-lg border border-hairline bg-surface p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="approval-dialog-title" className="text-[0.9375rem] font-medium text-ink">
          {request.title}
        </p>
        {request.message ? (
          <p className="mt-2 whitespace-pre-wrap text-[0.875rem] text-ink">
            {request.message}
          </p>
        ) : null}

        {request.kind === "confirm" ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={deny}>
              Reject
            </Button>
            <Button
              variant="primary"
              onClick={() => onRespond(request.approvalId, { accept: true })}
            >
              Allow
            </Button>
          </div>
        ) : null}

        {request.kind === "select" ? (
          <div className="mt-4 flex flex-col gap-2">
            {(request.options ?? []).map((option) => (
              <Button
                key={option}
                variant="secondary"
                onClick={() => onRespond(request.approvalId, { choice: option })}
              >
                {option}
              </Button>
            ))}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={deny}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {request.kind === "input" ? (
          <div className="mt-4 flex flex-col gap-2">
            <input
              autoFocus
              value={text}
              placeholder={request.placeholder ?? ""}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onRespond(request.approvalId, { text });
                }
              }}
              className="w-full rounded border border-hairline bg-surface px-2 py-1.5 text-[0.875rem] text-ink"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={deny}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => onRespond(request.approvalId, { text })}
              >
                Submit
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
