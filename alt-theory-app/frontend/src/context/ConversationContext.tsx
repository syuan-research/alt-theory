import { createContext, useContext, type ReactNode } from "react";
import type { StreamPart } from "@/api/types";
import type { Conversation } from "@/hooks/useConversation";

const ConversationContext = createContext<Conversation | null>(null);
const PartsContext = createContext<StreamPart[]>([]);

/**
 * Binds one conversation to a subtree; the nearest binding wins, so shared
 * pieces (queue cards, Continue, status line) read whichever conversation
 * they are drawn for. The streaming parts have their own context: a token
 * re-renders only the stream view.
 */
export function ConversationScope({
  conversation,
  parts,
  children,
}: {
  conversation: Conversation;
  parts: StreamPart[];
  children: ReactNode;
}) {
  return (
    <ConversationContext.Provider value={conversation}>
      <PartsContext.Provider value={parts}>{children}</PartsContext.Provider>
    </ConversationContext.Provider>
  );
}

export function useConversationContext(): Conversation {
  const conversation = useContext(ConversationContext);
  if (!conversation) {
    throw new Error("useConversationContext must be used within a ConversationScope");
  }
  return conversation;
}

export function useTurnParts(): StreamPart[] {
  return useContext(PartsContext);
}
