import { useEffect, useState } from "react";
import type { ApprovalRequestPayload } from "@/api/types";
import { t } from "@/i18n";

interface ApprovalDockProps {
  request: ApprovalRequestPayload;
  onRespond: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => void;
}

// Security-extension approval options (core/security-extension.ts), plus
// the options of a message to another conversation (session-service.ts).
const ALLOW_SESSION = "Allow for this conversation";
const DENY_LABELS = new Set(["Deny", "Block", "No", "Cancel"]);

function approvalOption(option: string): string {
  if (option === "Allow once") return t("Allow once");
  if (option === ALLOW_SESSION) return t("Allow in this conversation, also after restart");
  if (option === "Allow 5 messages each way") return t("Allow 5 messages each way");
  if (option === "Always allow between these conversations") return t("Always allow between these conversations");
  if (option === "Deny") return t("Deny");
  return option;
}

const TITLE_KINDS: Array<[prefix: string, label: () => string]> = [
  ["Run command: ", () => t("Run command")],
  ["Read outside your workspace: ", () => t("Read outside your project and global folders")],
  ["Edit file: ", () => t("Edit file")],
  ["Write file: ", () => t("Write file")],
  ["Message another conversation: ", () => t("Message another conversation")],
];
const UNAVAILABLE = "Smart approval unavailable: ";
const NEEDS = "Needs approval: ";

/** Why an action is asked about (core/security-extension.ts), translated by its kind. */
const REASON_KINDS: Array<[prefix: string, label: () => string]> = [
  ["Push to: ", () => t("Push to")],
  ["Upload to: ", () => t("Upload to")],
  ["Publish to: ", () => t("Publish to")],
  ["Install with: ", () => t("Install with")],
  ["Write outside your folders: ", () => t("Write outside your folders")],
  ["Read outside your folders: ", () => t("Read outside your folders")],
  ["Database file: ", () => t("Database file")],
  ["Credential location: ", () => t("Credential location")],
  ["Discards git work: ", () => t("Discards git work")],
  ["Changes git's own files: ", () => t("Changes git's own files")],
];

function reasonLabel(reason: string): string {
  for (const [prefix, label] of REASON_KINDS) {
    if (reason.startsWith(prefix)) return `${label()}: ${reason.slice(prefix.length)}`;
  }
  return reason === "Too complex to check" ? t("Too complex to check") : reason;
}

/**
 * The security extension's title read as its parts: a note (smart approval
 * could not answer), what kind of action, and the command or path itself —
 * which gets the room, since it is what the user has to judge.
 */
export function approvalParts(title: string): {
  note: string | null;
  reasons: string[];
  label: string;
  value: string | null;
} {
  let note: string | null = null;
  let rest = title;
  const firstLine = () => {
    const newline = rest.indexOf("\n");
    const line = rest.slice(0, newline < 0 ? undefined : newline);
    rest = newline < 0 ? "" : rest.slice(newline + 1);
    return line;
  };
  if (rest.startsWith(UNAVAILABLE)) {
    const reason = firstLine().slice(UNAVAILABLE.length);
    note = t("Smart approval could not answer ({reason}), so this one is up to you.", { reason });
  }
  const reasons: string[] = [];
  while (rest.startsWith(NEEDS)) reasons.push(reasonLabel(firstLine().slice(NEEDS.length)));
  for (const [prefix, label] of TITLE_KINDS) {
    if (rest.startsWith(prefix)) return { note, reasons, label: label(), value: rest.slice(prefix.length) };
  }
  return { note, reasons, label: rest, value: null };
}

/**
 * Low-key approval dock above the composer (M7 §3). Renders the real option set
 * the security extension sends (Allow once / Allow for this conversation / Deny) for
 * select approvals; guard rail, not a sandbox.
 */
export function ApprovalDock({ request, onRespond }: ApprovalDockProps) {
  const [text, setText] = useState("");
  useEffect(() => setText(""), [request.approvalId]);

  const deny = () =>
    onRespond(request.approvalId, { accept: false, choice: null, text: null });

  const choose = (option: string) => onRespond(request.approvalId, { choice: option });

  const parts = approvalParts(request.title);

  return (
    <div className="approval-dock">
      <div className="dock-head">
        <i className="ph ph-shield-check" aria-hidden="true" />
        <span className="dock-kind">{parts.label}</span>
      </div>
      {parts.note ? <div className="dock-note">{parts.note}</div> : null}
      {parts.reasons.map((reason) => (
        <div className="dock-reason" key={reason}>
          {reason}
        </div>
      ))}
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
