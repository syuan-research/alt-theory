export function isKbPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/kb/") || normalized.startsWith("kb/");
}

export function toolLabel(name: string, path?: string | null): string {
  const kbPath = isKbPath(path);
  if (name === "read") {
    return kbPath ? "Reading knowledge base…" : "Reading file…";
  }
  if (name === "grep") {
    return kbPath ? "Searching for relevant theories…" : "Searching files…";
  }
  if (name === "find") {
    return kbPath ? "Locating knowledge base files…" : "Locating files…";
  }
  if (name === "ls") {
    return kbPath ? "Listing knowledge base…" : "Listing resources…";
  }
  if (name === "write") return "Writing notes…";
  return `${name}…`;
}