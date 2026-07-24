// Native bridge exposed by the Electron preload (window.altElectron). In a
// plain browser (dev / hosted) it's absent, so each call falls back to a path
// prompt — the existing behavior — and reveal is simply unavailable.

interface AltElectron {
  pickDirectory(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  revealPath(target: string): Promise<void>;
}

function bridge(): AltElectron | null {
  return (window as unknown as { altElectron?: AltElectron }).altElectron ?? null;
}

/** True when running inside the Electron bundle (native dialogs available). */
export function hasNativeBridge(): boolean {
  return bridge() !== null;
}

/** Pick a working folder — native dialog in Electron, path prompt otherwise. */
export async function pickDirectory(promptLabel: string): Promise<string | null> {
  const el = bridge();
  if (el) return el.pickDirectory();
  const path = window.prompt(promptLabel);
  return path?.trim() || null;
}

/** Pick one or more files — native dialog in Electron, single path prompt otherwise. */
export async function pickFiles(promptLabel: string): Promise<string[]> {
  const el = bridge();
  if (el) return el.pickFiles();
  const path = window.prompt(promptLabel);
  return path?.trim() ? [path.trim()] : [];
}

/** Reveal a path in the OS file manager (Electron only; no-op elsewhere). */
export async function revealPath(target: string): Promise<void> {
  await bridge()?.revealPath(target);
}
