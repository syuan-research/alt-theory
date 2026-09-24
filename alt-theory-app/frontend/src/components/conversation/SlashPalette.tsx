import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { AltMode } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { t } from "@/i18n";

export interface SlashCommand {
  name: string;
  description: string;
  run: (args: string) => void;
  /**
   * Runs on click with nothing typed. False for skills: a skill invoked with
   * no question makes the agent hunt for one. Those arm the composer instead —
   * `/name ` lands in the box and the user says what they want.
   */
  immediate?: boolean;
}

/**
 * The slash commands of the conversation drawn here. Branch, BTW, compact
 * and skills act on that conversation; /new starts one in the main view.
 */
export function useSlashCommands({
  live,
  mode,
  helper,
}: {
  /** A materialized conversation (the new-conversation page has no branch/compact). */
  live: boolean;
  /** Skills offered for this mode. */
  mode: AltMode;
  helper: SlashCommand;
}): SlashCommand[] {
  const app = useApp();
  const main = useMainView();
  const conversation = useConversationContext();
  return useMemo(() => {
    const idle = () => Boolean(conversation.sessionId) && !conversation.isRunning;
    return [
      helper,
      ...(live
        ? [
            {
              name: "branch",
              description: t("Branch this conversation into a new direction"),
              run: () => void (idle() && conversation.fork("fork")),
              immediate: true,
            },
            {
              name: "btw",
              description: t("Start a side conversation without adding it to the list"),
              run: () => void (idle() && conversation.fork("side")),
              immediate: true,
            },
            {
              name: "compact",
              description: t("Compact this conversation to free context space"),
              run: () => void (idle() && conversation.compact()),
              immediate: true,
            },
          ]
        : []),
      {
        name: "new",
        description: t("Start a new conversation"),
        run: () => main.startNewSession(),
        immediate: true,
      },
      ...(app.discovery?.skills ?? [])
        .filter((skill) => skill.enabled?.[mode] !== false)
        .map((skill) => ({
          name: skill.name,
          description: skill.description || t("Alt Theory skill"),
          run: (args: string) => void conversation.invokeSkill(skill.name, args),
        })),
    ];
  }, [app.discovery, conversation, helper, live, main, mode]);
}

/** Palette state over the editor text: matches, selection, run, keys. */
export function useSlashPalette({
  draft,
  commands,
  setDraft,
  onArm,
}: {
  draft: string;
  commands: SlashCommand[];
  setDraft: (text: string) => void;
  /** Put `/name ` in the box, waiting for the user's request. */
  onArm?: (name: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const query = draft.startsWith("/") && !draft.startsWith("//") ? draft.slice(1) : null;
  const matches = useMemo(() => {
    if (query === null) return [];
    const token = query.split(/\s+/, 1)[0].toLowerCase();
    return commands.filter((command) => command.name.toLowerCase().startsWith(token));
  }, [commands, query]);
  const open = !dismissed && matches.length > 0;
  useEffect(() => setIndex(0), [matches.length]);

  const run = (command: SlashCommand) => {
    const args = query?.split(/\s+/).slice(1).join(" ") ?? "";
    if (!command.immediate && !args.trim()) {
      if (onArm) onArm(command.name);
      else setDraft(`/${command.name} `);
      return;
    }
    setDraft("");
    command.run(args);
  };

  return {
    open,
    matches,
    index,
    setIndex,
    run,
    /** The editor changed: a dismissed palette may show again. */
    reset: () => setDismissed(false),
    dismiss: () => setDismissed(true),
    /** Arrow keys move, Enter runs (unless `canRun` is false). True = handled. */
    onKeyDown(event: KeyboardEvent, canRun = true): boolean {
      if (!open) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setIndex((current) => (current + step + matches.length) % matches.length);
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canRun) run(matches[index]);
        return true;
      }
      return false;
    },
  };
}

export function SlashPalette({
  palette,
  className = "slash-palette",
}: {
  palette: ReturnType<typeof useSlashPalette>;
  className?: string;
}) {
  if (!palette.open) return null;
  return (
    <div className={className}>
      {palette.matches.map((command, index) => (
        <button
          key={command.name}
          className={`slash-item${index === palette.index ? " on" : ""}`}
          onMouseEnter={() => palette.setIndex(index)}
          onClick={() => palette.run(command)}
        >
          <span className="cmd">/{command.name}</span>
          <span className="desc">{command.description}</span>
        </button>
      ))}
    </div>
  );
}
