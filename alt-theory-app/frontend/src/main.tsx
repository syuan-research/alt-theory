import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@phosphor-icons/web/regular";
import { initI18n } from "./i18n";
import { isMacBundle } from "./lib/native";
import "./index.css";

// Set before the first paint: on macOS the OS draws the window buttons over
// the top-left of the page, which is where the left rail's brand row lives.
if (isMacBundle()) document.documentElement.dataset.macChrome = "1";

// The UI language must be known before ANY app module evaluates: some
// modules call t() in module-level constants, so App is imported only after
// the catalog is loaded. The setting comes from the local server — the
// await is milliseconds.
void initI18n()
  .catch(() => {})
  .then(async () => {
    const { default: App } = await import("./App");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });