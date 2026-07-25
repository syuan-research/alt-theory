import type { ToolDetail } from "@/api/types";

export function isKbPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/kb/") || normalized.startsWith("kb/");
}

/** Last path segment — the only part of a path worth a line in the flow. */
export function fileName(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

/**
 * One line describing what the agent is doing, in the user's terms.
 *
 * This is the single choke point for tool display: both the live stream
 * (MessageList ToolLine) and replayed history render through it, so a branch
 * added here shows up in both. Before alpha.3 it ignored the path it was
 * given, which is why every action read "Reading file… / Writing notes…".
 */
export function toolLabel(
  name: string,
  path?: string | null,
  detail?: ToolDetail | null
): string {
  if (detail?.kind === "skill" && detail.skillName) {
    return `Using the ${detail.skillName} skill`;
  }
  if (name === "bash" || name === "shell") {
    const command = detail?.kind === "command" ? detail.body.split("\n")[0] : null;
    return command ? `Ran ${command}` : "Running a command…";
  }

  const kbPath = isKbPath(path);
  const named = fileName(path);
  const on = named ? ` ${named}` : "";

  if (name === "read") {
    if (kbPath) return "Reading knowledge base…";
    return named ? `Reading ${named}` : "Reading file…";
  }
  if (name === "grep") {
    return kbPath ? "Searching for relevant theories…" : "Searching files…";
  }
  if (name === "find") {
    return kbPath ? "Locating knowledge base files…" : "Locating files…";
  }
  if (name === "ls") {
    return kbPath ? "Listing knowledge base…" : `Listing${on || " resources…"}`;
  }
  if (name === "write") return named ? `Writing ${named}` : "Writing notes…";
  if (name === "edit" || name === "multi_edit" || name === "str_replace") {
    return named ? `Editing ${named}` : "Editing a file…";
  }
  if (name === "web_search" || name === "websearch") return "Searching online…";
  if (name === "fetch" || name === "page_fetch") return "Reading a web page…";
  return `${name}…`;
}
