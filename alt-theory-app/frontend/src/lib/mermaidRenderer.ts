import type { MermaidConfig } from "mermaid";

export type MermaidTheme = "light" | "dark";

const PALETTES: Record<MermaidTheme, { fill: string; ink: string; border: string }> = {
  light: { fill: "#dce8f7", ink: "#1f1e1a", border: "#6b8db5" },
  dark: { fill: "#2e3d52", ink: "#ececeb", border: "#86a9d3" },
};

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
let diagramSeq = 0;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((module) => module.default);
  }
  return mermaidReady;
}

function configFor(theme: MermaidTheme, background?: string): MermaidConfig {
  const palette = PALETTES[theme];
  return {
    startOnLoad: false,
    securityLevel: "strict",
    // A broken diagram throws instead of drawing mermaid's error graphic;
    // the fenced source stays visible (perf plan WP 1.7).
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: {
      // Unset, base falls back to tertiaryColor (the node fill), which tinted
      // whole-SVG backgrounds away from the canvas color.
      ...(background ? { background } : {}),
      primaryColor: palette.fill,
      secondaryColor: palette.fill,
      tertiaryColor: palette.fill,
      primaryTextColor: palette.ink,
      secondaryTextColor: palette.ink,
      tertiaryTextColor: palette.ink,
      primaryBorderColor: palette.border,
      secondaryBorderColor: palette.border,
      tertiaryBorderColor: palette.border,
      lineColor: palette.ink,
      ...Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`cScale${index}`, palette.fill]),
      ),
      ...Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`cScaleLabel${index}`, palette.ink]),
      ),
    },
  };
}

/** Render one diagram with an explicit theme. Initialization and rendering are
 * serialized because Mermaid's theme configuration is process-global. */
export function renderMermaidSvg(
  source: string,
  theme: MermaidTheme,
  background?: string,
): Promise<string> {
  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize(configFor(theme, background));
    const id = `d${(diagramSeq += 1)}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      // Mermaid's scratch nodes for a failed render can stay in <body>.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
