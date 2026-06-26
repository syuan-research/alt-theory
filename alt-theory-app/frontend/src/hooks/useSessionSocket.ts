import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssemblyManifest,
  ServerMessage,
  SessionMetrics,
  SessionSnapshot,
  TranscriptMessage,
} from "@/api/types";
import {
  createAltTheorySocket,
  sendClientMessage,
} from "@/api/websocket";

export interface ChatMessage {
  id: string;
  role: TranscriptMessage["role"];
  text: string;
  streaming?: boolean;
}

export interface SessionState {
  sessionId: string | null;
  sessionReady: boolean;
  isRunning: boolean;
  connStatus: "connecting" | "idle" | "running" | "disconnected" | "error";
  connLabel: string;
  messages: ChatMessage[];
  error: string | null;
  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSessionSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectSessionIdRef = useRef<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  const [state, setState] = useState<SessionState>({
    sessionId: null,
    sessionReady: false,
    isRunning: false,
    connStatus: "connecting",
    connLabel: "Connecting",
    messages: [],
    error: null,
    manifest: null,
    metrics: null,
  });

  const updateConn = useCallback(
    (connStatus: SessionState["connStatus"], connLabel: string) => {
      setState((prev) => ({ ...prev, connStatus, connLabel }));
    },
    []
  );

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "session_draft":
        if (reconnectSessionIdRef.current) break;
        setState((prev) => ({
          ...prev,
          sessionId: null,
          sessionReady: true,
          isRunning: false,
          connStatus: "idle",
          connLabel: "Draft ready",
          manifest: null,
          metrics: null,
        }));
        break;

      case "session_metadata":
        setState((prev) => ({
          ...prev,
          manifest: message.payload,
          sessionId:
            typeof message.payload.sessionId === "string"
              ? message.payload.sessionId
              : prev.sessionId,
        }));
        break;

      case "session_metrics":
        setState((prev) => ({ ...prev, metrics: message.payload }));
        break;

      case "session_opened":
      case "session_updated": {
        const snapshot = message.payload as SessionSnapshot;
        reconnectSessionIdRef.current = snapshot.sessionId;
        setState((prev) => ({
          ...prev,
          sessionId: snapshot.sessionId,
          sessionReady: true,
          isRunning: snapshot.status === "running",
          connStatus: snapshot.status === "running" ? "running" : "idle",
          connLabel: snapshot.status === "running" ? "Running" : "Ready",
        }));
        break;
      }

      case "session_transcript": {
        const messages = message.payload.messages.map((entry) => ({
          id: nextId(),
          role: entry.role,
          text: entry.text,
        }));
        streamingIdRef.current = null;
        setState((prev) => ({
          ...prev,
          messages,
          isRunning: false,
          connStatus: "idle",
          connLabel: "Ready",
        }));
        break;
      }

      case "assistant_delta": {
        const delta = message.payload.text;
        setState((prev) => {
          const streamingId = streamingIdRef.current;
          if (!streamingId) {
            const id = nextId();
            streamingIdRef.current = id;
            return {
              ...prev,
              messages: [
                ...prev.messages,
                { id, role: "assistant", text: delta, streaming: true },
              ],
            };
          }
          return {
            ...prev,
            messages: prev.messages.map((entry) =>
              entry.id === streamingId
                ? { ...entry, text: `${entry.text}${delta}`, streaming: true }
                : entry
            ),
          };
        });
        break;
      }

      case "run_completed": {
        streamingIdRef.current = null;
        setState((prev) => ({
          ...prev,
          isRunning: false,
          connStatus: "idle",
          connLabel: "Ready",
          messages: prev.messages.map((entry) =>
            entry.streaming ? { ...entry, streaming: false } : entry
          ),
        }));
        break;
      }

      case "run_failed":
      case "error": {
        const errorText =
          message.type === "run_failed"
            ? message.payload.error
            : message.payload.error;
        streamingIdRef.current = null;
        setState((prev) => ({
          ...prev,
          isRunning: false,
          connStatus: "error",
          connLabel: "Error",
          error: errorText,
          messages: prev.messages.map((entry) =>
            entry.streaming ? { ...entry, streaming: false } : entry
          ),
        }));
        break;
      }

      default:
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = createAltTheorySocket(
      handleServerMessage,
      (status, detail) => {
        if (status === "open") {
          reconnectAttemptRef.current = 0;
          const resuming = reconnectSessionIdRef.current;
          updateConn("idle", resuming ? "Reconnected" : "Connected");
          if (resuming) {
            sendClientMessage(ws, {
              type: "open_session",
              payload: { sessionId: resuming },
            });
          }
        } else if (status === "closed") {
          updateConn("disconnected", "Disconnected");
          setState((prev) => ({
            ...prev,
            sessionReady: false,
            isRunning: false,
          }));
          if (reconnectTimerRef.current) return;
          const delay = Math.min(
            30_000,
            1_000 * 2 ** reconnectAttemptRef.current
          );
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            updateConn("disconnected", "Reconnecting...");
            connect();
          }, delay);
        } else if (status === "error") {
          updateConn("error", detail ?? "Connection error");
        } else {
          updateConn("connecting", "Connecting");
        }
      }
    );

    wsRef.current = ws;
  }, [enabled, handleServerMessage, updateConn]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendPrompt = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const sent = sendClientMessage(wsRef.current, {
      type: "prompt",
      payload: trimmed,
    });
    if (!sent) return false;

    streamingIdRef.current = null;
    setState((prev) => ({
      ...prev,
      error: null,
      isRunning: true,
      connStatus: "running",
      connLabel: "Running",
      messages: [
        ...prev.messages,
        { id: nextId(), role: "user", text: trimmed },
      ],
    }));
    return true;
  }, []);

  const abortRun = useCallback(() => {
    sendClientMessage(wsRef.current, { type: "abort" });
  }, []);

  const startNewSession = useCallback(() => {
    reconnectSessionIdRef.current = null;
    streamingIdRef.current = null;
    setState((prev) => ({
      ...prev,
      sessionId: null,
      messages: [],
      error: null,
      manifest: null,
      metrics: null,
    }));
    sendClientMessage(wsRef.current, { type: "new_session" });
  }, []);

  const refreshRuntime = useCallback(() => {
    sendClientMessage(wsRef.current, { type: "get_session_metadata" });
    sendClientMessage(wsRef.current, { type: "get_session_metrics" });
  }, []);

  const invokeSkill = useCallback((skillName: string, userText?: string) => {
    const sent = sendClientMessage(wsRef.current, {
      type: "invoke_skill",
      payload: {
        skillName,
        ...(userText ? { userText } : {}),
      },
    });
    if (!sent) return false;

    streamingIdRef.current = null;
    setState((prev) => ({
      ...prev,
      error: null,
      isRunning: true,
      connStatus: "running",
      connLabel: "Running",
      messages: [
        ...prev.messages,
        {
          id: nextId(),
          role: "user",
          text: userText || `Invoke ${skillName}`,
        },
      ],
    }));
    return true;
  }, []);

  return {
    ...state,
    sendPrompt,
    abortRun,
    startNewSession,
    refreshRuntime,
    invokeSkill,
  };
}