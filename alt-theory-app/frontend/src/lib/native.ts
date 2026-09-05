// Native bridge exposed by the Electron preload (window.altElectron). In a
// plain browser (dev / hosted) it's absent, so each call falls back to a path
// prompt — the existing behavior — and reveal is simply unavailable.

export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  htmlUrl: string | null;
  newer: boolean;
}

interface AltElectron {
  pickDirectory(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  revealPath(target: string): Promise<void>;
  /** Electron only — real absolute path for a dropped File. */
  getPathForFile?(file: File): string;
  getUpdateStatus?(): Promise<AppUpdateStatus>;
  checkForUpdates?(): Promise<AppUpdateStatus>;
  dismissUpdate?(version: string): Promise<AppUpdateStatus>;
  openExternal?(url: string): Promise<boolean>;
  onUpdateStatus?(callback: (status: AppUpdateStatus) => void): () => void;
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

export async function getUpdateStatus(): Promise<AppUpdateStatus | null> {
  return (await bridge()?.getUpdateStatus?.()) ?? null;
}

export async function checkForUpdates(): Promise<AppUpdateStatus | null> {
  return (await bridge()?.checkForUpdates?.()) ?? null;
}

export async function dismissUpdate(version: string): Promise<AppUpdateStatus | null> {
  return (await bridge()?.dismissUpdate?.(version)) ?? null;
}

export async function openExternal(url: string): Promise<boolean> {
  return (await bridge()?.openExternal?.(url)) ?? false;
}

export function onUpdateStatus(
  callback: (status: AppUpdateStatus) => void,
): () => void {
  return bridge()?.onUpdateStatus?.(callback) ?? (() => {});
}

/**
 * Resolve absolute paths for files dropped on the composer.
 * Electron: webUtils.getPathForFile. Plain browser: empty (no real local path).
 */
export function pathsFromDroppedFiles(fileList: FileList | File[]): string[] {
  const el = bridge();
  const files = Array.from(fileList);
  if (!el?.getPathForFile) return [];
  const paths: string[] = [];
  for (const file of files) {
    const path = el.getPathForFile(file)?.trim();
    if (path) paths.push(path);
  }
  return paths;
}
