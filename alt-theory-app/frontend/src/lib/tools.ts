import type { ToolDetail } from "@/api/types";
import { t } from "@/i18n";

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
  detail?: ToolDetail | null,
  state: "running" | "finished" | "failed" | "pending" = "finished",
): string {
  if (detail?.kind === "skill" && detail.skillName) {
    return t("Using the {skillName} skill", { skillName: detail.skillName });
  }
  if (name === "bash" || name === "shell") {
    const command = detail?.kind === "command" ? detail.body.split("\n")[0] : null;
    if (state === "failed") {
      return command ? t("Did not run {command}", { command }) : t("Command did not run");
    }
    if (state === "running") return t("Running a command…");
    return command ? t("Ran {command}", { command }) : t("Command finished");
  }

  const kbPath = isKbPath(path);
  const named = fileName(path);

  if (name === "read") {
    if (state === "failed") {
      return named ? t("Did not read {name}", { name: named }) : t("File was not read");
    }
    if (kbPath) return t("Reading knowledge base…");
    return named ? t("Reading {name}", { name: named }) : t("Reading file…");
  }
  if (name === "grep") {
    return kbPath ? t("Searching for relevant theories…") : t("Searching files…");
  }
  if (name === "find") {
    return kbPath ? t("Locating knowledge base files…") : t("Locating files…");
  }
  if (name === "ls") {
    if (kbPath) return t("Listing knowledge base…");
    return named ? t("Listing {name}", { name: named }) : t("Listing resources…");
  }
  if (name === "write") {
    if (state === "failed") return named ? t("Did not write {name}", { name: named }) : t("File was not written");
    if (state === "pending") return named ? t("Writing did not complete for {name}", { name: named }) : t("Writing did not complete");
    return named ? t("Writing {name}", { name: named }) : t("Writing notes…");
  }
  if (name === "edit" || name === "multi_edit" || name === "str_replace") {
    if (state === "failed") return named ? t("Did not edit {name}", { name: named }) : t("File was not edited");
    if (state === "pending") return named ? t("Editing did not complete for {name}", { name: named }) : t("Editing did not complete");
    return named ? t("Editing {name}", { name: named }) : t("Editing a file…");
  }
  if (name === "web_search" || name === "websearch") return t("Searching online…");
  if (name === "fetch" || name === "page_fetch") return t("Reading a web page…");
  return t("{name}…", { name });
}
