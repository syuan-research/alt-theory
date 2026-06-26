import type { ClientMessage, ServerMessage } from "./types";

export function resolveWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    if (configured) return configured;
    const backend =
      (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
      "http://127.0.0.1:3000";
    const url = new URL(backend);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

export function createAltTheorySocket(
  onMessage: (message: ServerMessage) => void,
  onStatus: (status: "connecting" | "open" | "closed" | "error", detail?: string) => void
): WebSocket {
  const ws = new WebSocket(resolveWebSocketUrl());

  ws.addEventListener("open", () => onStatus("open"));
  ws.addEventListener("close", () => onStatus("closed"));
  ws.addEventListener("error", () => onStatus("error", "Connection error"));

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      onMessage(message);
    } catch {
      onStatus("error", "Malformed server message");
    }
  });

  onStatus("connecting");
  return ws;
}

export function sendClientMessage(ws: WebSocket | null, message: ClientMessage): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

export function sendPrompt(ws: WebSocket | null, text: string): boolean {
  return sendClientMessage(ws, { type: "prompt", payload: text });
}

export function sendAbort(ws: WebSocket | null): boolean {
  return sendClientMessage(ws, { type: "abort" });
}

export function sendSwitchKb(ws: WebSocket | null, domain: string): boolean {
  return sendClientMessage(ws, { type: "switch_kb", payload: { domain } });
}

export function sendSwitchRolePreset(
  ws: WebSocket | null,
  rolePresetSlug: string | null
): boolean {
  return sendClientMessage(ws, {
    type: "switch_role_preset",
    payload: { rolePresetSlug },
  });
}

export function sendSwitchProfile(
  ws: WebSocket | null,
  profileSlug: string | null
): boolean {
  return sendClientMessage(ws, {
    type: "switch_profile",
    payload: { profileSlug },
  });
}

export function sendSwitchSoul(
  ws: WebSocket | null,
  soulSlug: string | null
): boolean {
  return sendClientMessage(ws, { type: "switch_soul", payload: { soulSlug } });
}

export function sendSwitchInstruction(
  ws: WebSocket | null,
  customInstructionRef: string | null
): boolean {
  return sendClientMessage(ws, {
    type: "switch_instruction",
    payload: { customInstructionRef },
  });
}

export function sendSwitchProject(
  ws: WebSocket | null,
  projectId: string | null
): boolean {
  return sendClientMessage(ws, {
    type: "switch_project",
    payload: { projectId },
  });
}

export function sendSwitchVisibility(
  ws: WebSocket | null,
  visibility: "research" | "private"
): boolean {
  return sendClientMessage(ws, {
    type: "switch_visibility",
    payload: { visibility },
  });
}

export function sendInvokeSkill(
  ws: WebSocket | null,
  skillName: string,
  userText?: string
): boolean {
  return sendClientMessage(ws, {
    type: "invoke_skill",
    payload: userText ? { skillName, userText } : { skillName },
  });
}

export function sendReviseLatest(ws: WebSocket | null, text: string): boolean {
  return sendClientMessage(ws, { type: "revise_latest", payload: { text } });
}

export function sendDeleteLatest(ws: WebSocket | null): boolean {
  return sendClientMessage(ws, { type: "delete_latest" });
}

export function sendForkSession(
  ws: WebSocket | null,
  purpose: "collaboration" | "comparison",
  forkPointEntryId?: string
): boolean {
  return sendClientMessage(ws, {
    type: "fork_session",
    payload: forkPointEntryId ? { purpose, forkPointEntryId } : { purpose },
  });
}

export function sendNewSession(ws: WebSocket | null): boolean {
  return sendClientMessage(ws, { type: "new_session" });
}

export function sendOpenSession(ws: WebSocket | null, sessionId: string): boolean {
  return sendClientMessage(ws, {
    type: "open_session",
    payload: { sessionId },
  });
}

export function sendGetSessionMetadata(ws: WebSocket | null): boolean {
  return sendClientMessage(ws, { type: "get_session_metadata" });
}

export function sendGetSessionMetrics(ws: WebSocket | null): boolean {
  return sendClientMessage(ws, { type: "get_session_metrics" });
}