import { useCallback, useEffect, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@/api/types";
import {
  createAltTheorySocket,
  sendClientMessage,
} from "@/api/websocket";

export type WsConnStatus = "connecting" | "open" | "closed" | "error";

const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 10_000;

export interface UseWebSocketOptions {
  enabled: boolean;
  onMessage: (message: ServerMessage) => void;
  onStatus: (
    status: WsConnStatus,
    detail?: { label?: string; connected?: boolean }
  ) => void;
}

/** One socket with reconnect backoff; what to re-open is the caller's business. */
export function useWebSocket({
  enabled,
  onMessage,
  onStatus,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAllowedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);

  enabledRef.current = enabled;
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;

  const send = useCallback((message: ClientMessage): boolean => {
    return sendClientMessage(wsRef.current, message);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!reconnectAllowedRef.current || !enabledRef.current) return;
    if (reconnectTimerRef.current) return;
    const delay = Math.min(
      WS_RECONNECT_MAX_MS,
      WS_RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current
    );
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!reconnectAllowedRef.current || !enabledRef.current) return;
      onStatusRef.current("closed", { label: "Reconnecting..." });
      connect();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = createAltTheorySocket(
      (message) => onMessageRef.current(message),
      (status, detail) => {
        if (status === "open") {
          reconnectAttemptRef.current = 0;
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          onStatusRef.current("open", { label: "Connected", connected: true });
        } else if (status === "closed") {
          if (!reconnectAllowedRef.current || !enabledRef.current) return;
          onStatusRef.current("closed", {
            label: "Disconnected",
            connected: false,
          });
          scheduleReconnect();
        } else if (status === "error") {
          if (!reconnectAllowedRef.current || !enabledRef.current) return;
          onStatusRef.current("error", {
            label: detail ?? "Connection error",
            connected: false,
          });
        } else {
          onStatusRef.current("connecting", { label: "Connecting" });
        }
      }
    );

    wsRef.current = ws;
  }, [scheduleReconnect]);

  useEffect(() => {
    reconnectAllowedRef.current = enabled;
    connect();
    return () => {
      reconnectAllowedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, enabled]);

  return {
    send,
    reconnect: connect,
    getSocket: () => wsRef.current,
  };
}
