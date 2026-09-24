import { useConversationContext } from "@/context/ConversationContext";
import { t } from "@/i18n";
import { noticeText, noticeWarns } from "@/lib/runState";

/**
 * One stable status row while a turn runs or a request waits. Clearing the
 * label on each assistant_delta used to collapse this strip and reflow the
 * whole column, so an empty detail keeps the row as blank filler.
 */
export function RunStatusSlot() {
  const conversation = useConversationContext();
  const { phase, label } = conversation.runState;
  if (phase === "disconnected" || phase === "error") {
    return (
      <span className="run-phase-slot">
        <span>{label}</span>
      </span>
    );
  }
  if (!conversation.isRunning) return null;
  return (
    <span className="run-phase-slot">
      {conversation.runState.detail ? (
        <span className="run-phase">
          <i className="ph ph-circle-notch" aria-hidden="true" />
          {conversation.runState.detail}
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
  const { notice, draftSaveFailed } = useConversationContext();
  const unsaved = draftSaveFailed ? (
    <span className="run-tip">
      <i className="ph ph-warning" aria-hidden="true" />
      {t("This draft could not be saved on this device; it is kept only until the app closes.")}
    </span>
  ) : null;
  if (!notice) return unsaved;
  const { body } = notice;
  const icon = body.kind === "text" ? body.icon : noticeWarns(body) ? "warning" : undefined;
  return (
    <>
    {unsaved}
    <span className="run-tip">
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
      conversation.draftSaveFailed ||
      conversation.recovery?.canContinue,
  );
}
