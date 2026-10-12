/**
 * The frame mail between conversations travels in (web-server/agent-mail.ts).
 * Every text an agent or the system delivers into a conversation — a lead's
 * task, the first one included; a subagent's report; another conversation's
 * message; a notice — enters the receiver's context as a user-role fragment
 * in this frame, naming its sender. The user's own words are never framed.
 * The transcript shows a framed text as a line naming the sender, and smart
 * approval's reviewer reads the sender from it (core/approval-reviewer.ts).
 */

export const AGENT_MAIL_TAG = "agent-team-mail";

export interface AgentMailFrame {
  /** "lead", "lead <name>", a subagent's name, "<name> (Session ID …)", or "user". */
  fromLabel: string;
  event?: string | null;
  cause?: string | null;
  /** Sent by another conversation (not a lead or own subagent). */
  peer?: boolean;
  body: string;
}

export function frameAgentMail(mail: AgentMailFrame): string {
  // Quotes in a user-chosen name would break the attribute syntax (and the
  // round-trip parse below), so normalize them.
  const header = [
    `from="${mail.fromLabel.replace(/"/g, "'")}"`,
    mail.event ? `event="${mail.event}"` : null,
    mail.cause ? `cause="${mail.cause}"` : null,
    mail.peer ? `peer="true"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  // A body cannot close the frame early and speak outside it.
  const body = mail.body.replaceAll(`</${AGENT_MAIL_TAG}`, `<\\/${AGENT_MAIL_TAG}`);
  return `<${AGENT_MAIL_TAG} ${header}>\n${body}\n</${AGENT_MAIL_TAG}>`;
}

/** The frame's parts; null when the text is not framed mail. */
export function parseAgentMailFrame(text: string): {
  fromLabel: string;
  event: string | null;
  cause: string | null;
  peer: boolean;
  body: string;
} | null {
  const match = text.match(
    new RegExp(
      `^<${AGENT_MAIL_TAG} from="([^"]*)"(?: event="([^"]*)")?(?: cause="([^"]*)")?( peer="true")?>\\n([\\s\\S]*)\\n</${AGENT_MAIL_TAG}>$`,
    ),
  );
  if (!match) return null;
  return {
    fromLabel: match[1],
    event: match[2] ?? null,
    cause: match[3] ?? null,
    peer: Boolean(match[4]),
    body: match[5],
  };
}
