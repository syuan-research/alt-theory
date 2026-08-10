import { useEffect, useState } from "react";
import { externalAiSetupContent } from "@/config/externalAiSetup";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

export function ExternalAiSetupDialog() {
  const shell = useShell();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!shell.externalAiSetupOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") shell.closeExternalAiSetup();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [shell.externalAiSetupOpen, shell.closeExternalAiSetup]);
  if (!shell.externalAiSetupOpen) return null;
  const content = externalAiSetupContent();

  const copy = async () => {
    await navigator.clipboard.writeText(content.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
        <div className="external-ai-warnings">
          <p><i className="ph ph-key" /> {content.safety}</p>
          <p><i className="ph ph-list-magnifying-glass" /> {content.modelIds}</p>
        </div>
        <pre>{content.prompt}</pre>
        <footer>
          <button className="flat" onClick={shell.closeExternalAiSetup}>
            {t("Back")}
          </button>
          <button className="add-btn" onClick={() => void copy()}>
            <i className={copied ? "ph ph-check" : "ph ph-copy"} />
            {copied ? t("Copied") : t("Copy prompt")}
          </button>
        </footer>
      </section>
    </div>
  );
}
