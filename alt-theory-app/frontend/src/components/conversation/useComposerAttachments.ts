import { useState, type ClipboardEvent, type DragEvent, type DragEventHandler } from "react";
import { classifyDroppedFiles, stageAttachmentFile } from "@/api/session-files";
import { useConversationContext } from "@/context/ConversationContext";
import { NEW_DRAFT, stageInDraft } from "@/lib/draft";
import { pathsFromDroppedFiles } from "@/lib/native";
import { WORKSPACE_PATH_MIME } from "@/lib/workspace";
import { t } from "@/i18n";

export function useComposerAttachments() {
  const conversation = useConversationContext();
  const { sessionId, sessionReady, workspacePrimaryDir, permission } = conversation;
  const [dragOver, setDragOver] = useState(false);
  const stage = (path: string) => stageInDraft(sessionId ?? NEW_DRAFT, [path]);
  const reportError = (error: unknown) => window.alert(error instanceof Error ? error.message : String(error));

  const attachCopies = (files: File[]) => {
    for (const file of files) {
      void stageAttachmentFile(file).then(({ path, extractError }) => {
        stage(path);
        if (extractError) {
          window.alert(t("{name} was attached, but its text could not be read: {error}", {
            name: file.name,
            error: extractError,
          }));
        }
      }).catch(reportError);
    }
  };

  const acceptsDrop = (event: DragEvent) =>
    sessionReady && event.dataTransfer.types.some((type) => type === WORKSPACE_PATH_MIME || type === "Files");

  async function attachDroppedFiles(files: File[]) {
    const paths = files.map((file) => pathsFromDroppedFiles([file])[0] ?? "");
    const choices = paths.some(Boolean)
      ? await classifyDroppedFiles({ paths, sessionId, workspacePrimaryDir, fullAccess: permission === "full" })
      : [];
    files.forEach((file, index) => {
      const choice = choices[index];
      if (choice === "reference") stage(paths[index]);
      else if (choice === "blocked") window.alert(t("Access to credential path denied: {path}", { path: paths[index] }));
      else attachCopies([file]);
    });
  }

  const dropHandlers = {
    onDragEnter(event) {
      if (!acceptsDrop(event)) return;
      event.preventDefault();
      setDragOver(true);
    },
    onDragOver(event) {
      if (!acceptsDrop(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event) {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
    },
    onDrop(event) {
      setDragOver(false);
      if (!acceptsDrop(event)) return;
      event.preventDefault();
      const internal = event.dataTransfer.getData(WORKSPACE_PATH_MIME);
      if (internal) stage(internal);
      else void attachDroppedFiles([...event.dataTransfer.files]).catch(reportError);
    },
  } satisfies Record<string, DragEventHandler<HTMLDivElement>>;

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (!sessionReady || !files.length || event.clipboardData.getData("text/plain")) return;
    event.preventDefault();
    attachCopies(files);
  };
  return { attachCopies, dragOver, dropHandlers, onPaste };
}
