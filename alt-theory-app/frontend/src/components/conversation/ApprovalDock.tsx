import { useEffect, useState } from "react";
import type { ApprovalRequestPayload } from "@/api/types";
import { t } from "@/i18n";

interface ApprovalDockProps {
  request: ApprovalRequestPayload;
  onRespond: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => void;
  /** Called with a marker label when the user grants a conversation-scoped allowance. */
  onSessionAllow: (label: string) => void;
}

// Security-extension approval options (core/security-extension.ts).
const ALLOW_SESSION = "Allow for this conversation";
const DENY_LABELS = new Set(["Deny", "Block", "No", "Cancel"]);

function approvalOption(option: string): string {
  if (option === "Allow once") return t("Allow once");
  if (option === ALLOW_SESSION) return t("Allow for this conversation");
  if (option === "Deny") return t("Deny");
  return option;
}

const TITLE_KINDS: Array<[prefix: string, label: () => string]> = [
  ["Run command: ", () => t("Run command")],
  ["Read outside your workspace: ", () => t("Read outside your project and global folders")],
  ["Allow writes in this folder for this session: ", () => t("Allow writes in this folder for this session")],
  ["Edit file: ", () => t("Edit file")],
  ["Write file: ", () => t("Write file")],
];
const UNAVAILABLE = "Smart approval unavailable: ";

/**
 * The security extension's title read as its parts: a note (smart approval
 * could not answer), what kind of action, and the command or path itself —
 * which gets the room, since it is what the user has to judge.
 */
export function approvalParts(title: string): { note: string | null; label: string; value: string | null } {
  let note: string | null = null;
  let rest = title;
  if (rest.startsWith(UNAVAILABLE)) {
    const newline = rest.indexOf("\n");
    const reason = rest.slice(UNAVAILABLE.length, newline < 0 ? undefined : newline);
    note = t("Smart approval could not answer ({reason}), so this one is up to you.", { reason });
    rest = newline < 0 ? "" : rest.slice(newline + 1);
  }
  for (const [prefix, label] of TITLE_KINDS) {
    if (rest.startsWith(prefix)) return { note, label: label(), value: rest.slice(prefix.length) };
  }
  return { note, label: rest, value: null };
}

/**
 * Low-key approval dock above the composer (M7 §3). Renders the real option set
 * the security extension sends (Allow once / Allow for this conversation / Deny) for
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

  const parts = approvalParts(request.title);

  return (
    <div className="approval-dock">
      <div className="dock-head">
        <i className="ph ph-shield-check" aria-hidden="true" />
        <span className="dock-kind">{parts.label}</span>
      </div>
      {parts.note ? <div className="dock-note">{parts.note}</div> : null}
      {parts.value ? <pre className="dock-value">{parts.value}</pre> : null}
      {request.message ? <div className="l2">{request.message}</div> : null}

      <div className="dock-actions">
        {request.kind === "select" ? (
          (request.options ?? []).map((option) => (
            <button
              key={option}
              className={DENY_LABELS.has(option) ? "deny" : ""}
              onClick={() => choose(option)}
            >
              {approvalOption(option)}
            </button>
          ))
        ) : null}

        {request.kind === "confirm" ? (
          <>
            <button
              className="primary"
              onClick={() => onRespond(request.approvalId, { accept: true })}
            >
              {t("Allow")}
            </button>
            <button className="deny" onClick={deny}>
              {t("Block")}
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
              {t("Submit")}
            </button>
            <button className="deny" onClick={deny}>
              {t("Cancel")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
