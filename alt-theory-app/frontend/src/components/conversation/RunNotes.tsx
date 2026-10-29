import { useEffect, useState } from "react";
import { useConversationContext } from "@/context/ConversationContext";
import { t } from "@/i18n";
import { GENERAL_TIPS, productTipText } from "@/config/productTips";
import { noticeText, noticeWarns } from "@/lib/runState";

/**
 * Rotating tips for the status slot (alpha.6): waiting is when a user has
 * attention to spare, so this is where the app says what it can do — but
 * only things that already exist and that the user drives themselves.
 * Second-class by design (owner 2026-10-29): the text surfaces inside the
 * status line and only when that line has no label; it never occupies its
 * own row again. Short turns should not flash a tip at all.
 */
const FIRST_DELAY_MS = 2000;
/** Owner: +3s so tips are readable while a turn runs (was 7s). */
const ROTATE_MS = 10000;

function useRotatingTip(active: boolean): string {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const start = window.setTimeout(() => {
      setIndex(Math.floor(Math.random() * GENERAL_TIPS.length));
      setVisible(true);
    }, FIRST_DELAY_MS);
    return () => window.clearTimeout(start);
  }, [active]);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % GENERAL_TIPS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [visible]);
  // Stable text swap in place; remounting on every tip change nudged the band.
  return visible ? productTipText(GENERAL_TIPS[index]) : "";
}

/**
 * The band's one status line (v1.10.x): fixed-height, content by ladder —
 * connection phase first, then the request/activity label, then a rotating
 * tip when the composer opts in, then the blank anti-jitter fill. Tool calls
 * and thinking never appear here; the body carries them permanently.
 */
export function RunStatusSlot({ tips = false }: { tips?: boolean }) {
  const conversation = useConversationContext();
  const { phase, label, detail } = conversation.runState;
  const tip = useRotatingTip(conversation.isRunning && tips);
  if (phase === "disconnected" || phase === "error") {
    return (
      <span className="run-phase-slot">
        <span>{label}</span>
      </span>
    );
  }
  if (!conversation.isRunning) return null;
  const text = detail || (tips ? tip : "");
  return (
    <span className="run-phase-slot" data-tip={text || undefined}>
      {text ? (
        <span className="run-phase">
          <i
            className={`ph ${detail ? "ph-circle-notch run-spin" : "ph-lightbulb"}`}
            aria-hidden="true"
          />
          <span className="run-phase-text">{text}</span>
        </span>
      ) : (
        <span className="run-phase-slot-fill" aria-hidden="true">
          &nbsp;
        </span>
      )}
    </span>
  );
}

/**
 * The conversation's latest notice (run outcome, refusal, extension, UI) —
 * and, while it lasts, that its draft could not be saved on this device.
 */
export function NoticeLine() {
  const { notice, draftSaveFailed, lastFailure, isRunning } = useConversationContext();
  const unsaved = draftSaveFailed ? (
    <span className="run-tip">
      <i className="ph ph-warning" aria-hidden="true" />
      {t("This draft could not be saved on this device; it is kept only until the app closes.")}
    </span>
  ) : null;
  const body = !isRunning && lastFailure
    ? { kind: "run-failed" as const, failure: lastFailure, interrupted: false }
    : notice?.body;
  if (!body) return unsaved;
  const icon = body.kind === "text" ? body.icon : noticeWarns(body) ? "warning" : undefined;
  return (
    <>
    {unsaved}
    <span className="run-tip run-notice">
      {icon ? (
        <i
          className={`ph ${
            icon === "warning" ? "ph-warning" : icon === "bookmark" ? "ph-bookmark-simple" : "ph-export"
          }`}
          aria-hidden="true"
        />
      ) : null}
      {noticeText(body)}
    </span>
    </>
  );
}

/** Continue from the break point — offered only by the snapshot's recovery. */
export function ContinueButton() {
  const conversation = useConversationContext();
  if (conversation.isRunning || !conversation.recovery?.canContinue) return null;
  return (
    <button className="flat retry-run" onClick={() => conversation.continueLatest()}>
      <i className="ph ph-play" aria-hidden="true" />
      {t("Continue")}
    </button>
  );
}

/** Whether any of the rows above has something to show. */
export function hasRunNotes(conversation: ReturnType<typeof useConversationContext>): boolean {
  const { phase } = conversation.runState;
  return Boolean(
    conversation.isRunning ||
      phase === "disconnected" ||
      phase === "error" ||
      conversation.notice ||
      conversation.lastFailure ||
      conversation.draftSaveFailed ||
      conversation.recovery?.canContinue,
  );
}
