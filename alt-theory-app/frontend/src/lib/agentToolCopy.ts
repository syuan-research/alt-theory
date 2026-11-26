import { t } from "@/i18n";

export function describeAgentToolInput(tool: string, json: string, displayedName?: string) {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    args = parsed;
  } catch {
    return null;
  }

  const value = (key: string) => typeof args[key] === "string" ? args[key] as string : undefined;
  const fields: Array<[string, string]> = [];
  const lines: string[] = [];
  const labeled = (label: string, value: string) => t("{label}: {value}", { label, value });
  const used = new Set(["message"]);
  const field = (key: string, label: string, fallback?: string) => {
    used.add(key);
    const text = value(key) ?? fallback;
    if (text !== undefined) fields.push([label, text]);
  };

  if (tool === "spawn_agent") {
    field("agent_type", t("Requested tier"), t("Default"));
    const model = value("model");
    const suffix = model?.match(/:(off|minimal|low|medium|high|xhigh|max)$/);
    const modelId = suffix ? model?.slice(0, -suffix[0].length) : model;
    const slash = modelId?.indexOf("/") ?? -1;
    const modelName = slash > 0 ? modelId?.slice(slash + 1) : modelId;
    used.add("model");
    lines.push(t("{model} ({thinking})", {
      model: labeled(t("Model"), modelName === "inherit" && slash < 0
        ? t("Inherit from the lead") : modelName ?? t("From the selected tier")),
      thinking: labeled(t("Thinking level"), suffix ? t(suffix[1]) : t("Automatic")),
    }));
    if (modelId && slash > 0) lines.push(labeled(t("Provider"), modelId.slice(0, slash)));
    field("role", t("Role"), t("Inherit from the lead"));
    field("permission", t("Permission"), t("Automatic"));
    lines.push(fields.splice(0).map(([label, text]) => labeled(label, text)).join(t(", ")));
    used.add("name");
    const requestedName = value("name")?.trim();
    if (requestedName && requestedName !== displayedName) {
      lines.push(labeled(t("Requested name"), requestedName));
    }
  } else if (tool === "send_to_agent") {
    field("agent", t("Recipient"));
  } else if (tool === "check_agent") {
    field("agent", t("Agent queried"));
    if (typeof args.verbose === "boolean") fields.push([t("Include recent activity"), args.verbose ? t("Yes") : t("No")]);
    used.add("verbose");
  }

  for (const [key, entry] of Object.entries(args)) {
    if (!used.has(key)) fields.push([key, typeof entry === "string" ? entry : JSON.stringify(entry)]);
  }
  return { message: value("message"), lines, fields };
}

export function describeAgentToolResult(tool: string, result: string): string | null {
  if (tool === "spawn_agent" && /^Spawned subagent "/.test(result)) {
    if (result.includes("It could not start.")) return t("The subagent could not start.");
    return result.includes("It is queued behind ")
      ? t("The subagent will start when a slot is free.")
      : t("The subagent started working.");
  }
  if (tool === "send_to_agent") {
    if (result === "The subagent could not start.") return t("The subagent could not start.");
    if (/is acting on your message now\.$/.test(result)) return t("The agent started working on the message.");
    if (/next step\.$/.test(result)) return t("The agent will read the message at its next step.");
    if (/^(Queued:|The subagent is queued;)/.test(result)) return t("The agent will receive the message when its work starts.");
  }
  if (tool === "check_agent") {
    const match = result.match(/^[^\n]* \([^)]+\): ([^\n]+)(?:\n([\s\S]*))?$/);
    if (!match) return null;
    const statuses: Record<string, string> = {
      queued: t("Queued"), running: t("Running"), idle: t("Idle"),
      finished: t("Completed"), failed: t("Failed"), interrupted: t("Stopped"),
      "interrupted (stopped by the user)": t("Stopped by the user"),
      "interrupted (by you)": t("Stopped by the lead"),
      "interrupted (app closed)": t("Stopped when the app closed"),
      "interrupted (user-directed continuation)": t("Restarting with user guidance"),
    };
    const status = statuses[match[1]];
    if (!status) return null;
    const rest = match[2]?.replace(/^last output: /, `${t("Latest reply")}\n`)
      .replace("(the subagent has produced no text answer yet)", t("No reply yet"));
    return rest ? `${t("Checked status")} · ${status}\n\n${rest}` : `${t("Checked status")} · ${status}`;
  }
  return null;
}
