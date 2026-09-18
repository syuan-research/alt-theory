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

type ToolState = "running" | "finished" | "failed" | "pending";

/**
 * One line describing what the agent is doing, in the user's terms.
 *
 * This is the single choke point for tool display: the live stream
 * (MessageList ToolLine), replayed history and the Markdown export all
 * render through it, so a branch added here shows up everywhere. Every
 * tool speaks in the row's state: running, finished, failed, or pending —
 * a call that never got a result, which must not read as done.
 */
export function toolLabel(
  name: string,
  path?: string | null,
  detail?: ToolDetail | null,
  state: ToolState = "finished",
): string {
  if (detail?.kind === "skill" && detail.skillName) {
    return t("Using the {skillName} skill", { skillName: detail.skillName });
  }
  const lines = (byState: Record<ToolState, string>) => byState[state];
  if (name === "bash" || name === "shell") {
    const command = detail?.kind === "command" ? detail.body.split("\n")[0] : null;
    return lines({
      running: t("Running a command…"),
      finished: command ? t("Ran {command}", { command }) : t("Command finished"),
      failed: command ? t("Did not run {command}", { command }) : t("Command did not run"),
      pending: command ? t("{command} did not complete", { command }) : t("Command did not complete"),
    });
  }

  const kbPath = isKbPath(path);
  const named = fileName(path);

  if (name === "read") {
    return lines({
      running: kbPath ? t("Reading knowledge base…") : named ? t("Reading {name}…", { name: named }) : t("Reading file…"),
      finished: kbPath ? t("Read the knowledge base") : named ? t("Read {name}", { name: named }) : t("Read a file"),
      failed: named ? t("Did not read {name}", { name: named }) : t("File was not read"),
      pending: named ? t("Reading did not complete for {name}", { name: named }) : t("Reading did not complete"),
    });
  }
  if (name === "grep") {
    return lines({
      running: kbPath ? t("Searching for relevant theories…") : t("Searching files…"),
      finished: kbPath ? t("Searched for relevant theories") : t("Searched files"),
      failed: t("Search failed"),
      pending: t("Search did not complete"),
    });
  }
  if (name === "find") {
    return lines({
      running: kbPath ? t("Locating knowledge base files…") : t("Locating files…"),
      finished: kbPath ? t("Located knowledge base files") : t("Located files"),
      failed: t("Could not locate files"),
      pending: t("Locating files did not complete"),
    });
  }
  if (name === "ls") {
    return lines({
      running: kbPath ? t("Listing knowledge base…") : named ? t("Listing {name}…", { name: named }) : t("Listing resources…"),
      finished: kbPath ? t("Listed the knowledge base") : named ? t("Listed {name}", { name: named }) : t("Listed resources"),
      failed: named ? t("Did not list {name}", { name: named }) : t("Listing failed"),
      pending: named ? t("Listing did not complete for {name}", { name: named }) : t("Listing did not complete"),
    });
  }
  if (name === "write") {
    return lines({
      running: named ? t("Writing {name}…", { name: named }) : t("Writing notes…"),
      finished: named ? t("Wrote {name}", { name: named }) : t("Wrote notes"),
      failed: named ? t("Did not write {name}", { name: named }) : t("File was not written"),
      pending: named ? t("Writing did not complete for {name}", { name: named }) : t("Writing did not complete"),
    });
  }
  if (name === "edit" || name === "multi_edit" || name === "str_replace") {
    return lines({
      running: named ? t("Editing {name}…", { name: named }) : t("Editing a file…"),
      finished: named ? t("Edited {name}", { name: named }) : t("Edited a file"),
      failed: named ? t("Did not edit {name}", { name: named }) : t("File was not edited"),
      pending: named ? t("Editing did not complete for {name}", { name: named }) : t("Editing did not complete"),
    });
  }
  if (name === "web_search" || name === "websearch") {
    return lines({
      running: t("Searching online…"),
      finished: t("Searched online"),
      failed: t("Online search failed"),
      pending: t("Online search did not complete"),
    });
  }
  if (name === "fetch" || name === "page_fetch") {
    return lines({
      running: t("Reading a web page…"),
      finished: t("Read a web page"),
      failed: t("Did not read the web page"),
      pending: t("Reading the web page did not complete"),
    });
  }
  if (name === "spawn_agent") {
    return lines({
      running: t("Creating a subagent…"),
      finished: t("Created a subagent"),
      failed: t("Subagent was not created"),
      pending: t("Subagent creation did not complete"),
    });
  }
  return lines({
    running: t("{name}…", { name }),
    finished: name,
    failed: t("{name} failed", { name }),
    pending: t("{name} did not complete", { name }),
  });
}
