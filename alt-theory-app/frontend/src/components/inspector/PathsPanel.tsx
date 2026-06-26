import type { AssemblyManifest } from "@/api/types";
import { HintText, MonoText } from "@/components/ui/Typography";
import { collapsePath } from "@/lib/format";
import { manifestPathEntries } from "@/lib/manifest";
import { cn } from "@/lib/cn";

interface PathsPanelProps {
  manifest: AssemblyManifest | null;
}

export function PathsPanel({ manifest }: PathsPanelProps) {
  const entries = manifestPathEntries(manifest);

  if (!entries.length) {
    return (
      <div className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">Paths</p>
        <MonoText>—</MonoText>
        <HintText>Open a session or refresh runtime to load manifest paths.</HintText>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.75rem] font-semibold text-text-secondary">Paths</p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <button
            key={`${entry.label}-${entry.path}`}
            type="button"
            className={cn(
              "w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-left transition-colors hover:bg-hover"
            )}
            title={entry.path}
            onClick={() => void navigator.clipboard.writeText(entry.path)}
          >
            <p className="text-[0.75rem] font-semibold text-text-secondary">
              {entry.label}
            </p>
            <MonoText className="block break-all">
              {collapsePath(entry.path)}
            </MonoText>
          </button>
        ))}
      </div>
      <HintText>Click a path to copy the full value.</HintText>
    </div>
  );
}