import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  mergeQueuedPrompts,
  shouldFlushQueuedPrompts,
} from "@/lib/promptQueue";
import { isInterruptedError } from "@/lib/format";

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: string[];
}

/**
 * The ONE prompt queue (v1.4.3, owner rulings 2026-08-07): while a run is
 * active, Enter enqueues; the cards stay OURS (editable/deletable) until a
 * step boundary, when `flushIntoRun` steers them into the running turn —
 * "queued" means the agent's next api call, never the end of the run. What
 * is still queued when the run ends flushes as the next turn's prompt
 * (after the transcript refresh, so the merged bubble is not wiped).
 */
export function usePromptQueue(
  startPrompt: RefObject<(text: string, attachments: string[]) => boolean>,
) {
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const queuedPromptsRef = useRef<QueuedPrompt[]>([]);
  const sendAfterInterruptRef = useRef<string | null>(null);

  const replace = useCallback(
    (update: (current: QueuedPrompt[]) => QueuedPrompt[]) => {
      setQueuedPrompts((current) => {
        const next = update(current);
        queuedPromptsRef.current = next;
        return next;
      });
    },
    [],
  );

  const enqueue = useCallback(
    (text: string, attachments: string[]) => {
      replace((current) => [
        ...current,
        { id: crypto.randomUUID(), text, attachments },
      ]);
    },
    [replace],
  );

  const flush = useCallback(
    (onlyId?: string) => {
      const allQueued = queuedPromptsRef.current;
      const queued = onlyId
        ? allQueued.filter((item) => item.id === onlyId)
        : allQueued;
      const merged = mergeQueuedPrompts(queued);
      replace((current) =>
        onlyId ? current.filter((item) => item.id !== onlyId) : [],
      );
      if (!merged) return;
      if (!startPrompt.current(merged.text, merged.attachments)) {
        replace((current) => [...queued, ...current]);
      }
    },
    [replace, startPrompt],
  );

  /** Remove and return a queued item (for editing back into the draft). */
  const restore = useCallback(
    (id: string): QueuedPrompt | null => {
      const queued = queuedPromptsRef.current.find((item) => item.id === id);
      if (!queued) return null;
      replace((current) => current.filter((item) => item.id !== id));
      return queued;
    },
    [replace],
  );

  const remove = useCallback(
    (id: string) => {
      replace((current) => current.filter((item) => item.id !== id));
    },
    [replace],
  );

  const clear = useCallback(() => {
    queuedPromptsRef.current = [];
    setQueuedPrompts([]);
  }, []);

  /**
   * Drain the queue INTO the running turn at a step boundary (owner
   * 2026-08-07: queued = delivered at the next api call, never waits for
   * the whole run). The caller's sender steers via the busy-prompt path.
   */
  const flushIntoRun = useCallback(
    (send: (text: string, attachments: string[]) => boolean) => {
      const queued = queuedPromptsRef.current;
      if (queued.length === 0) return;
      const merged = mergeQueuedPrompts(queued);
      replace(() => []);
      if (!merged) return;
      if (!send(merged.text, merged.attachments)) {
        replace((current) => [...queued, ...current]);
      }
    },
    [replace],
  );

  /** Abort the run to send this queued message straight away. */
  const interruptAndSend = useCallback((id: string, abort: () => boolean) => {
    if (!queuedPromptsRef.current.some((item) => item.id === id)) return;
    sendAfterInterruptRef.current = id;
    if (!abort()) sendAfterInterruptRef.current = null;
  }, []);

  /** A plain user abort must not fire a pending interrupt-and-send. */
  const cancelPendingInterrupt = useCallback(() => {
    sendAfterInterruptRef.current = null;
  }, []);

  /** Flush ordering rule: only after the transcript refresh lands. */
  const handleRunCompleted = useCallback(
    (refreshed: Promise<unknown>) => {
      sendAfterInterruptRef.current = null;
      void refreshed.finally(() => flush());
    },
    [flush],
  );

  /** Returns whether the failure was a user interruption. */
  const handleRunFailed = useCallback(
    (error: string, refreshed: Promise<unknown>): boolean => {
      const interrupted = isInterruptedError(error);
      const queuedId = interrupted ? sendAfterInterruptRef.current : null;
      sendAfterInterruptRef.current = null;
      if (
        interrupted &&
        shouldFlushQueuedPrompts("interrupted", Boolean(queuedId))
      ) {
        void refreshed.finally(() => flush(queuedId ?? undefined));
      }
      return interrupted;
    },
    [flush],
  );

  return {
    queuedPrompts,
    queuedPromptsRef,
    enqueue,
    flush,
    flushIntoRun,
    restore,
    remove,
    clear,
    interruptAndSend,
    cancelPendingInterrupt,
    handleRunCompleted,
    handleRunFailed,
  };
}
