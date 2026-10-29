import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useApp } from "@/context/AppProvider";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { t } from "@/i18n";

export interface SlashCommand {
  name: string;
  displayName?: string;
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
}: {
  /** A materialized conversation (the new-conversation page has no branch/compact). */
  live: boolean;
}): SlashCommand[] {
  const app = useApp();
  const main = useMainView();
  const conversation = useConversationContext();
  return useMemo(() => {
    const liveSession = () => Boolean(conversation.sessionId);
    return [
      ...(live
        ? [
            {
              name: "branch",
              description: t("Branch this conversation into a new direction"),
              run: () => void (liveSession() && conversation.fork("fork")),
              immediate: true,
            },
            {
              name: "btw",
              description: t("Start a side conversation without adding it to the list"),
              run: () => void (liveSession() && conversation.fork("side")),
              immediate: true,
            },
            {
              name: "compact",
              description: t("Compact this conversation to free context space"),
              run: () => void (liveSession() && !conversation.isRunning && conversation.compact()),
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
        .filter((skill) => skill.enabled !== false)
        .map((skill) => ({
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description || t("Alt Theory skill"),
          run: (args: string) => void conversation.invokeSkill(skill.name, args),
        })),
    ];
  }, [app.discovery, conversation, live, main]);
}

/** Palette state over the editor text: matches, selection, run, keys. */
export function useSlashPalette({
  draft,
  commands,
  setDraft,
}: {
  draft: string;
  commands: SlashCommand[];
  setDraft: (text: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const invocation = draft.match(/^\/skill:([^\s]+)(?:\s([\s\S]*))?$/);
  const skill = invocation ? commands.find((command) => !command.immediate && command.name === invocation[1]) : undefined;
  const text = skill ? invocation?.[2] ?? "" : draft;
  const typedCommand = draft.match(/^\/([^\s]+)(?:\s([\s\S]*))?$/);
  const exactCommand = typedCommand ? commands.find((command) => command.name === typedCommand[1]) : undefined;
  const query = browsing ? "" : !skill && draft.startsWith("/") && !draft.startsWith("//") ? draft.slice(1) : null;
  const matches = useMemo(() => {
    if (query === null) return [];
    const token = query.split(/\s+/, 1)[0].toLowerCase();
    return commands.filter((command) => command.name.toLowerCase().startsWith(token) || command.displayName?.toLowerCase().startsWith(token));
  }, [commands, query]);
  const open = !dismissed && matches.length > 0;
  useEffect(() => setIndex(0), [matches.length]);

  const run = (command: SlashCommand) => {
    const args = browsing ? text : draft.match(/^\/\S+\s?([\s\S]*)$/)?.[1] ?? "";
    setBrowsing(false);
    if (!command.immediate) {
      setDraft(`/skill:${command.name} ${args}`);
      setDismissed(true);
      return;
    }
    if (!browsing) setDraft("");
    command.run(args);
  };

  return {
    open,
    skill,
    text,
    prompt: exactCommand && !exactCommand.immediate ? `/skill:${exactCommand.name} ${typedCommand?.[2] ?? ""}` : draft,
    runImmediate: () => {
      if (!exactCommand?.immediate) return false;
      run(exactCommand);
      return true;
    },
    setText: (value: string) => setDraft(skill ? `/skill:${skill.name} ${value}` : value),
    removeSkill: () => setDraft(text),
    browse: () => { setBrowsing(true); setDismissed(false); },
    matches,
    index,
    setIndex,
    run,
    /** The editor changed: a dismissed palette may show again. */
    reset: () => { setDismissed(false); setBrowsing(false); },
    dismiss: () => { setDismissed(true); setBrowsing(false); },
    /** Arrow keys move, Enter runs (unless `canRun` is false). True = handled. */
    onKeyDown(event: KeyboardEvent, canRun = true): boolean {
      if (event.nativeEvent.isComposing || !open) return false;
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

export function SkillDraftChip({ palette }: { palette: ReturnType<typeof useSlashPalette> }) {
  if (!palette.skill) return null;
  return <div className="staged-attachments"><span className="attachment-chip">
    <i className="ph ph-cube" aria-hidden="true" />
    <span>{palette.skill.displayName ?? palette.skill.name}</span>
    <button type="button" aria-label={t("Remove")} onClick={palette.removeSkill}><i className="ph ph-x" /></button>
  </span></div>;
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
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => palette.run(command)}
        >
          <span className="cmd">/{command.displayName ?? command.name}</span>
          <span className="desc">{command.description}</span>
        </button>
      ))}
    </div>
  );
}
