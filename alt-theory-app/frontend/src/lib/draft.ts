/**
 * Text recalled from the queue joins whatever is already typed, on its own
 * line; an empty side contributes nothing.
 */
export function appendDraft(current: string, text: string): string {
  return [current, text].filter((part) => part.trim()).join("\n");
}
