import { Composer } from "@/components/conversation/Composer";
import { MessageList } from "@/components/conversation/MessageList";

export function ConversationPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col bg-canvas">
      <MessageList />
      <Composer />
    </section>
  );
}
