/** Searchable opening text from at most three user turns and their replies. */
export function openingPreview(messages: Iterable<{ role: string; text: string }>): string {
  const parts: string[] = [];
  let userTurns = 0;
  for (const message of messages) {
    if (message.role === "user") {
      if (userTurns === 3) break;
      userTurns++;
    } else if (message.role !== "assistant" || userTurns === 0) {
      continue;
    }
    const text = message.text.trim();
    if (text) parts.push(text.slice(0, 240));
  }
  return parts.join(" ").slice(0, 960);
}
