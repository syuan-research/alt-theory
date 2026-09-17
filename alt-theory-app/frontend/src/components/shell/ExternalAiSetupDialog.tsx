import { useEffect, useState } from "react";
import { getDocsRoot } from "@/api/config";
import { externalAiSetupContent } from "@/config/externalAiSetup";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

export function ExternalAiSetupDialog() {
  const shell = useShell();
  const open = shell.externalAiSetupOpen;
  const [copiedKey, setCopiedKey] = useState<"chat" | "agent" | null>(null);
  const [docsRoot, setDocsRoot] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") shell.closeExternalAiSetup();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, shell.closeExternalAiSetup]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getDocsRoot()
      .then(({ docsRoot: root }) => {
        if (alive) setDocsRoot(root);
      })
      .catch(() => {
        if (alive) setDocsRoot(null);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;
  const content = externalAiSetupContent();
  const agentPrompt = docsRoot
    ? `${content.agentPrompt}\n\n${content.agentDocsLine.replaceAll(
        "{{docsRoot}}",
        () => docsRoot,
      )}`
    : content.agentPrompt;

  const copy = async (key: "chat" | "agent", text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  };

  return (
    <div className="external-ai-backdrop" role="presentation">
      <section
        className="external-ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-ai-title"
      >
        <header>
          <div>
            <h2 id="external-ai-title">{content.title}</h2>
            <p>{content.intro}</p>
          </div>
          <button
            className="flat"
            autoFocus
            onClick={shell.closeExternalAiSetup}
            aria-label={t("Close")}
          >
            <i className="ph ph-x" />
          </button>
        </header>
        <div className="external-ai-scroll">
          <ul className="external-ai-bullets">
            <li>{content.safety}</li>
            <li>{content.modelIds}</li>
          </ul>
          <div>
            <div className="external-ai-blockhead">
              <span className="external-ai-blocklabel">{content.chatLabel}</span>
              <button
                className="add-btn"
                onClick={() => void copy("chat", content.chatPrompt)}
              >
                <i className={copiedKey === "chat" ? "ph ph-check" : "ph ph-copy"} />
                {copiedKey === "chat" ? t("Copied") : t("Copy prompt")}
              </button>
            </div>
            <pre>{content.chatPrompt}</pre>
          </div>
          <div>
            <div className="external-ai-blockhead">
              <span className="external-ai-blocklabel">{content.agentLabel}</span>
              <button
                className="add-btn"
                onClick={() => void copy("agent", agentPrompt)}
              >
                <i className={copiedKey === "agent" ? "ph ph-check" : "ph ph-copy"} />
                {copiedKey === "agent" ? t("Copied") : t("Copy prompt")}
              </button>
            </div>
            <pre>{agentPrompt}</pre>
          </div>
        </div>
        <footer>
          <button className="flat" onClick={shell.closeExternalAiSetup}>
            {t("Back")}
          </button>
          <span />
        </footer>
      </section>
    </div>
  );
}
