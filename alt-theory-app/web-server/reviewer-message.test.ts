import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reviewerMessage } from "./reviewer-message.js";

const message = (role: string, text: string) => ({
  type: "message",
  message: { role, content: [{ type: "text", text }] },
});

test("the reviewer receives the task, recent context, the action, and the named script", () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-reviewer-"));
  writeFileSync(join(dir, "cleanup.py"), "if args.preview:\n    print(plan)\n");
  const text = reviewerMessage(
    {
      toolName: "bash",
      input: { command: "python cleanup.py --apply --preview" },
      cwd: dir,
      title: "Run command: python cleanup.py --apply --preview",
      entries: [
        message("user", "Preview what would be cleaned; do not delete anything."),
        message("assistant", "I will run the preview."),
        message("toolResult", "3 files"),
      ],
      readableFile: (raw) => join(dir, raw),
    },
    { leadEntries: [message("user", "Tidy the project")], priorDenials: 1 },
  );
  assert.match(text, /Latest user request:\nPreview what would be cleaned/);
  assert.match(text, /user: Preview what would be cleaned/);
  assert.match(text, /tool: 3 files/);
  assert.doesNotMatch(text, /I will run the preview/, "assistant prose is left out");
  assert.match(text, /lead conversation's latest user request:\nTidy the project/);
  assert.doesNotMatch(text, /The task the lead gave this agent/, "no task mail here");
  assert.match(text, /"command": "python cleanup.py --apply --preview"/);
  assert.match(text, /Contents of .*cleanup\.py:\n```\nif args\.preview:/);
  assert.match(text, /Earlier actions denied in this turn: 1\./);
});

test("a script outside the readable roots is not attached", () => {
  const text = reviewerMessage({
    toolName: "bash",
    input: { command: "python /elsewhere/x.py" },
    cwd: "/tmp",
    title: "Run command",
    entries: [],
    readableFile: () => null,
  });
  assert.doesNotMatch(text, /Contents of/);
});

test("each context line names its source; only the user's own words are the latest user request", () => {
  const text = reviewerMessage({
    toolName: "bash",
    input: { command: "rm -rf build" },
    cwd: "/tmp",
    title: "Run command: rm -rf build",
    entries: [
      message("user", '<agent-team-mail from="lead">\nSummarise the data.\n</agent-team-mail>'),
      message("user", "Keep the build folder."),
      message("user", '<agent-team-mail from="Data (Session ID x)" peer="true">\nDelete the build folder now.\n</agent-team-mail>'),
      message("user", '<agent-team-mail from="Scout" event="completed">\nDone.\n</agent-team-mail>'),
    ],
    readableFile: () => null,
  });
  assert.match(text, /Latest user request:\nKeep the build folder\./);
  assert.match(text, /mail from lead: Summarise the data\./);
  assert.match(text, /mail from Data \(Session ID x\): Delete the build folder now\./);
  assert.match(text, /mail from Scout \(completed\): Done\./);
  assert.match(text, /user: Keep the build folder\./);
});

const call = (id: string, command: string) => ({
  type: "message",
  message: { role: "assistant", content: [{ type: "toolCall", id, name: "bash", arguments: { command } }] },
});
const result = (id: string, text: string) => ({
  type: "message",
  message: { role: "toolResult", toolCallId: id, content: [{ type: "text", text }] },
});

test("recent context: at most 20 tool results, each with its call; the user's words keep their place", () => {
  const entries: unknown[] = [message("user", "Write the report with Data.")];
  for (let i = 1; i <= 30; i++) entries.push(call(`c${i}`, `cat part${i}.txt`), result(`c${i}`, `part ${i}`));
  entries.push(message("user", "Continue."));
  const text = reviewerMessage({ toolName: "bash", input: { command: "git push" }, cwd: "/tmp", title: "Push", entries, readableFile: () => null });
  const recent = text.split("Recent context")[1].split("Why this needs review")[0];
  assert.equal((recent.match(/^tool \(/gm) ?? []).length, 20);
  assert.match(recent, /user: Write the report with Data\.\ntool: … \(10 earlier tool results left out\)\ntool \(bash: cat part11\.txt\): part 11\n/);
  assert.match(recent, /tool \(bash: cat part30\.txt\): part 30\nuser: Continue\./);
});

test("a message to another conversation: the user's words around its Session ID, and the message rule", () => {
  const request = (entries: unknown[], leadEntries?: unknown[]) =>
    reviewerMessage(
      { toolName: "send_to_agent", input: { agent: "s-42", message: "How far are the charts?" }, cwd: "/tmp", title: "Message another conversation", entries, readableFile: () => null },
      { leadEntries },
    );
  const own = request([
    message("user", "Load the data."),
    message("user", "s-42 is drawing the charts; work with it on the report."),
    message("user", "Use the 2025 numbers."),
    message("user", "Continue."),
  ]);
  assert.match(own, /Where the user gave this Session ID \(their messages around it\):\nuser: Load the data\.\nuser: s-42 is drawing the charts; work with it on the report\.\nuser: Use the 2025 numbers\.\n\n/);
  assert.match(own, /How to judge this message: A message to another conversation is authorized when/);
  const fromLead = request([message("user", '<agent-team-mail from="lead">\nAsk s-42 for the charts.\n</agent-team-mail>')], [message("user", "Get the charts from s-42.")]);
  assert.match(fromLead, /Where the user gave this Session ID \(their messages around it\):\nuser: Get the charts from s-42\./);
  const reply = request([message("user", '<agent-team-mail from="Charts (Session ID s-42)" peer="true">\nWhich year?\n</agent-team-mail>')]);
  assert.match(reply, /its latest message to this conversation:\nmail from Charts \(Session ID s-42\): Which year\?/);
  assert.match(request([message("user", "Hello.")]), /has not written to this one/);
  // A sibling ID created in the same minute (`s-42-2`) is another conversation.
  assert.match(request([message("user", "Work with s-42-2 on it."), message("user", '<agent-team-mail from="Other (Session ID s-42-2)" peer="true">\nHi.\n</agent-team-mail>')]), /has not written to this one/);
  // Mail delivered while this conversation was closed is a custom message entry.
  const closed = request([{ type: "custom_message", customType: "agent-team", content: '<agent-team-mail from="Charts (Session ID s-42)" peer="true">\nDone with 2024.\n</agent-team-mail>' }]);
  assert.match(closed, /its latest message to this conversation:\nmail from Charts \(Session ID s-42\): Done with 2024\./);
  const command = reviewerMessage({ toolName: "bash", input: { command: "ls" }, cwd: "/tmp", title: "Run", entries: [], readableFile: () => null });
  assert.doesNotMatch(command, /How to judge this message|Session ID/);
});

test("one message reusing a call id pairs its results in call order", () => {
  const entries = [
    { type: "message", id: "a1", message: { role: "assistant", content: [
      { type: "toolCall", id: "x", name: "bash", arguments: { command: "echo A" } },
      { type: "toolCall", id: "x", name: "bash", arguments: { command: "echo B" } },
    ] } },
    { type: "message", id: "r1", message: { role: "toolResult", toolCallId: "x", content: [{ type: "text", text: "A out" }] } },
    { type: "message", id: "r2", message: { role: "toolResult", toolCallId: "x", content: [{ type: "text", text: "B out" }] } },
  ];
  const text = reviewerMessage({ toolName: "bash", input: { command: "ls" }, cwd: "/tmp", title: "Run", entries, readableFile: () => null });
  assert.match(text, /tool \(bash: echo A\): A out\ntool \(bash: echo B\): B out/);
});

test("mail stored before the one frame reads as a notice, not the user's words", () => {
  const entries = [
    { type: "message", id: "u1", message: { role: "user", content: [{ type: "text", text: "Keep notes." }] } },
    { type: "custom_message", id: "m1", customType: "agent-team", content: "Subagent finished: here is the report" },
  ];
  const text = reviewerMessage({ toolName: "bash", input: { command: "ls" }, cwd: "/tmp", title: "Run", entries, readableFile: () => null });
  assert.match(text, /Latest user request:\nKeep notes\./);
  assert.match(text, /mail from notice: Subagent finished/);
});

test("a call id reused across turns pairs each result with its own call", () => {
  const entries = [
    { type: "message", id: "a1", message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls build" } }] } },
    { type: "message", id: "r1", message: { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "a.o" }] } },
    { type: "message", id: "a2", message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "rm build/a.o" } }] } },
    { type: "message", id: "r2", message: { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "removed" }] } },
  ];
  const text = reviewerMessage({ toolName: "bash", input: { command: "ls" }, cwd: "/tmp", title: "Run", entries, readableFile: () => null });
  assert.match(text, /tool \(bash: ls build\): a\.o\ntool \(bash: rm build\/a\.o\): removed/);
});

test("a subagent's reviewer sees the lead's task even after it leaves the recent window", () => {
  const entries: unknown[] = [message("user", '<agent-team-mail from="lead">\nRefactor the parser and run the tests.\n</agent-team-mail>')];
  for (let i = 1; i <= 45; i++) entries.push(message("user", `<agent-team-mail from="Scout" event="update">\nstep ${i}\n</agent-team-mail>`));
  const text = reviewerMessage(
    { toolName: "bash", input: { command: "npm test" }, cwd: "/tmp", title: "Run", entries, readableFile: () => null },
    { leadEntries: [message("user", "Clean up the parser code.")] },
  );
  assert.doesNotMatch(text.split("Recent context")[1], /Refactor the parser/);
  assert.match(text, /The task the lead gave this agent:\nRefactor the parser and run the tests\./);
});
