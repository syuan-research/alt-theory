export function mergeQueuedPrompts<T>(
  items: Array<{ text: string; attachments: T[] }>,
): { text: string; attachments: T[] } | undefined {
  const text = items.map((item) => item.text.trim()).filter(Boolean).join("\n");
  const attachments = items.flatMap((item) => item.attachments);
  return text || attachments.length ? { text, attachments } : undefined;
}
