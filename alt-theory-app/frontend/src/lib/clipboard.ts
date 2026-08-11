export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Older desktop webviews fall through to selection-based copying.
  }

  const active = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  try {
    return document.execCommand("copy");
  } finally {
    input.remove();
    active?.focus();
  }
}
