/**
 * Desktop notifications for work finishing in a conversation you are not
 * looking at (v1.3.0-alpha.3).
 *
 * The Electron renderer is a Chromium window, so the Web Notification API is
 * the whole implementation — no IPC bridge needed. Nothing fires while the
 * window is focused: if the user is here, the conversation itself is the
 * notification.
 */
export function notifyBackground(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (document.hasFocus()) return;
  const show = () => {
    try {
      const notification = new Notification(title, { body, silent: false });
      notification.onclick = () => window.focus();
    } catch {
      // Notifications unavailable (blocked, or a browser tab without permission).
    }
  };
  if (Notification.permission === "granted") show();
  else if (Notification.permission !== "denied") {
    void Notification.requestPermission().then((result) => {
      if (result === "granted") show();
    });
  }
}
