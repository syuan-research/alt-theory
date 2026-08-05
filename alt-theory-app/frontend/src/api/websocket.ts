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
