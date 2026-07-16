import { useEffect, useState } from "react";
import type { ApprovalRequestPayload } from "@/api/types";

interface ApprovalDockProps {
  request: ApprovalRequestPayload;
  onRespond: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => void;
  /** Called with a marker label when the user grants a session-scoped allowance. */
  onSessionAllow: (label: string) => void;
}

// Security-extension approval options (core/security-extension.ts).
const ALLOW_SESSION = "Allow for this session";
const DENY_LABELS = new Set(["Deny", "Block", "No", "Cancel"]);

/**
 * Low-key approval dock above the composer (M7 §3). Renders the real option set
 * the security extension sends (Allow once / Allow for this session / Deny) for
 * select approvals; guard rail, not a sandbox.
 */
export function ApprovalDock({ request, onRespond, onSessionAllow }: ApprovalDockProps) {
  const [text, setText] = useState("");
  useEffect(() => setText(""), [request.approvalId]);

  const deny = () =>
    onRespond(request.approvalId, { accept: false, choice: null, text: null });

  const choose = (option: string) => {
    if (option === ALLOW_SESSION) onSessionAllow(request.title);
    onRespond(request.approvalId, { choice: option });
  };

  return (
    <div className="approval-dock">
      <i className="ph ph-shield-check" style={{ color: "var(--text-2)" }} />
      <div className="what">
        <div className="l1">{request.title}</div>
        {request.message ? <div className="l2">{request.message}</div> : null}
      </div>

      {request.kind === "select" ? (
        (request.options ?? []).map((option) => (
          <button
            key={option}
            className={
              option === ALLOW_SESSION
                ? "primary"
                : DENY_LABELS.has(option)
                  ? "deny"
                  : ""
            }
            onClick={() => choose(option)}
          >
            {option}
          </button>
        ))
      ) : null}

      {request.kind === "confirm" ? (
        <>
          <button
            className="primary"
            onClick={() => onRespond(request.approvalId, { accept: true })}
          >
            Allow
          </button>
          <button className="deny" onClick={deny}>
            Block
          </button>
        </>
      ) : null}

      {request.kind === "input" ? (
        <>
          <input
            autoFocus
            className="dock-input"
            value={text}
            placeholder={request.placeholder ?? ""}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRespond(request.approvalId, { text });
            }}
          />
          <button
            className="primary"
            onClick={() => onRespond(request.approvalId, { text })}
          >
            Submit
          </button>
          <button className="deny" onClick={deny}>
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );
}
