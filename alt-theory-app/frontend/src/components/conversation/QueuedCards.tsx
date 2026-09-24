import { useConversationContext } from "@/context/ConversationContext";
import { t } from "@/i18n";

/**
 * Pi's queue for the conversation drawn here (card 11): texts waiting for the
 * next API call. Edit and delete both take the message out of the queue; only
 * edit hands it back (text and staged paths) to `onEdit`. The card goes when
 * the server's queue says so.
 */
export function QueuedCards({
  onEdit,
}: {
  onEdit: (retracted: { text: string; attachments: string[] }) => void;
}) {
  const conversation = useConversationContext();
  if (conversation.queuedTexts.length === 0) return null;
  const recall = async (text: string, toEditor: boolean) => {
    const retracted = await conversation.retractQueued(text);
    if (toEditor && retracted !== null) onEdit(retracted);
  };
  return (
    <div className="queued-prompts" aria-label={t("Queued messages")}>
      {conversation.queuedTexts.map((text, index) => (
        <div className="queued-prompt" key={`${index}:${text}`}>
          <i className="ph ph-clock" aria-hidden="true" />
          <span className="queued-prompt-text" data-tip={text}>
            {text}
          </span>
          <button
            type="button"
            className="queued-prompt-action"
            onClick={() => void recall(text, true)}
          >
            {t("Edit")}
          </button>
          <button
            type="button"
            className="queued-prompt-action"
            onClick={() => conversation.sendQueuedNow(text)}
          >
            {t("Jump the queue")}
          </button>
          <button
            type="button"
            className="queued-prompt-action"
            onClick={() => void recall(text, false)}
            data-tip={t("Delete")}
            aria-label={t("Delete")}
          >
            <i className="ph ph-trash" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
