// Dark-appearance flag, shared with ShellContext (same localStorage key) so the
// preference is consistent between the main app and the standalone /config route
// — which lives outside ShellProvider and would otherwise never apply a theme.

const DARK_MODE_KEY = "alt-theory-dark-mode";

export function isDarkStored(): boolean {
  try {
    return localStorage.getItem(DARK_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyTheme(dark: boolean): void {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function setDarkStored(dark: boolean): void {
  try {
    if (dark) localStorage.setItem(DARK_MODE_KEY, "1");
    else localStorage.removeItem(DARK_MODE_KEY);
  } catch {
    /* ignore */
  }
  applyTheme(dark);
}
